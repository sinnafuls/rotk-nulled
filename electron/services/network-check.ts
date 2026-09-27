import dns from "node:dns/promises";
import net from "node:net";
import dgram from "node:dgram";
import type { NetworkCheckEntry, NetworkCheckReport } from "../../shared/contracts.js";
import type { RuntimeConfig } from "./runtime-config.js";

/**
 * LOCAL EDIT (diagnostic): a self-service network check for VPN trouble.
 *
 * The launcher's whole network path is IPv4 literals (login host and gateway)
 * plus one A-record-only HTTPS host, so an IPv4/IPv6 mismatch can never be the
 * failure. What a VPN can still break is reachability of those endpoints from
 * the exit node, and this makes that visible in one click: DNS for the HTTPS
 * host, TCP to the website and the gateway, and one UDP probe per login port.
 *
 * The UDP probes cannot prove a login port is open - the server speaks only
 * its own protocol - so they report what IS provable: an ICMP port-unreachable
 * comes back as ECONNRESET/ECONNREFUSED ("refused"), which is a definitive
 * fail, while silence within the window is reported as "no refusal", the same
 * answer an open-but-strict server gives. Never throws.
 *
 * Executor-form promises throughout: the electron tsconfig targets ES2023,
 * where Promise.withResolvers is not in the standard library yet.
 */

const TCP_TIMEOUT_MS = 5_000;
const UDP_WINDOW_MS = 1_800;
const DNS_TIMEOUT_MS = 4_000;

interface TcpProbe {
  ok: boolean;
  ms: number;
  localAddress: string | null;
  reason: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function tcpProbe(host: string, port: number): Promise<TcpProbe> {
  return new Promise<TcpProbe>((resolve) => {
    const started = performance.now();
    const socket = net.connect({ host, port });
    const finish = (ok: boolean, reason: string): void => {
      const ms = Math.round(performance.now() - started);
      const localAddress = socket.localAddress ?? null;
      socket.destroy();
      resolve({ ok, ms, localAddress, reason });
    };
    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.once("connect", () => finish(true, ""));
    socket.once("timeout", () => finish(false, "timeout"));
    socket.once("error", (error: NodeJS.ErrnoException) => finish(false, error.code ?? error.message));
  });
}

function udpProbe(host: string, port: number): Promise<{ outcome: "ok" | "fail" | "warn"; detail: string; ms: number }> {
  return new Promise((resolve) => {
    const started = performance.now();
    const socket = dgram.createSocket("udp4");
    const finish = (outcome: "ok" | "fail" | "warn", detail: string): void => {
      const ms = Math.round(performance.now() - started);
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed by the error path */ }
      resolve({ outcome, detail, ms });
    };
    const timer = setTimeout(() => finish("warn", "no refusal within the window (an open-but-silent server answers the same)"), UDP_WINDOW_MS);
    socket.once("message", () => finish("ok", "answered"));
    socket.once("error", (error: Error) => {
      // Windows surfaces a later ICMP port-unreachable as ECONNRESET/ECONNREFUSED.
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ECONNRESET" || code === "ECONNREFUSED") finish("fail", "refused (ICMP port unreachable)");
      else finish("fail", code ?? error.message);
    });
    socket.send(Buffer.from([0]), port, host, (error) => {
      if (error) finish("fail", (error as NodeJS.ErrnoException).code ?? error.message);
    });
  });
}

function originHostPort(origin: string, defaultPort: number): { host: string; port: number } {
  const parsed = new URL(origin);
  const port = parsed.port !== "" ? Number(parsed.port) : defaultPort;
  return { host: parsed.hostname, port };
}

export async function runNetworkCheck(runtime: RuntimeConfig): Promise<NetworkCheckReport> {
  const entries: NetworkCheckEntry[] = [];
  const website = originHostPort(runtime.websiteOrigin, 443);
  const gateway = originHostPort(runtime.gatewayOrigin, 80);

  // DNS: the only hostname in the whole path. Shows the address family split,
  // which is why an IPv4/IPv6 preference can never be the VPN failure here.
  let aRecords: string[] = [];
  let aaaaRecords: string[] = [];
  let dnsError: string | null = null;
  try {
    const [a, aaaa] = await Promise.all([
      withTimeout(dns.resolve4(website.host), DNS_TIMEOUT_MS, "timeout").catch(() => [] as string[]),
      withTimeout(dns.resolve6(website.host), DNS_TIMEOUT_MS, "timeout").catch(() => [] as string[]),
    ]);
    aRecords = a;
    aaaaRecords = aaaa;
  } catch (error) {
    dnsError = error instanceof Error ? error.message : String(error);
  }
  entries.push({
    id: "dns",
    label: `DNS ${website.host}`,
    target: `A: ${aRecords.length} · AAAA: ${aaaaRecords.length}`,
    outcome: aRecords.length > 0 ? "ok" : "fail",
    detail: aRecords.length > 0
      ? `${aRecords.join(", ")}${aaaaRecords.length > 0 ? ` (and ${aaaaRecords.length} AAAA)` : " · no IPv6 at all"}`
      : dnsError ?? "no A record",
    ms: null,
  });

  const [websiteProbe, gatewayProbe] = await Promise.all([
    tcpProbe(website.host, website.port),
    tcpProbe(gateway.host, gateway.port),
  ]);
  entries.push({
    id: "website",
    label: `HTTPS API ${website.host}:${website.port}`,
    target: "ticket + attestation",
    outcome: websiteProbe.ok ? "ok" : "fail",
    detail: websiteProbe.ok ? `connected from ${websiteProbe.localAddress}` : websiteProbe.reason,
    ms: websiteProbe.ms,
  });
  entries.push({
    id: "gateway",
    label: `Gateway ${gateway.host}:${gateway.port}`,
    target: "launch gateway",
    outcome: gatewayProbe.ok ? "ok" : "fail",
    detail: gatewayProbe.ok ? `connected from ${gatewayProbe.localAddress}` : gatewayProbe.reason,
    ms: gatewayProbe.ms,
  });

  const egress = websiteProbe.localAddress ?? gatewayProbe.localAddress;
  if (egress !== null) {
    entries.push({
      id: "egress",
      label: "Egress address",
      target: "local IP the connections left from",
      outcome: "ok",
      detail: `${egress} (a VPN tunnel IP here means the probes measured the tunnel)`,
      ms: null,
    });
  }

  const udpResults = await Promise.all(runtime.loginPorts.map((port) => udpProbe(runtime.loginHost, port)));
  runtime.loginPorts.forEach((port, index) => {
    const probe = udpResults[index];
    entries.push({
      id: `login-${port}`,
      label: `Login UDP ${runtime.loginHost}:${port}`,
      target: "game login",
      outcome: probe.outcome,
      detail: probe.detail,
      ms: probe.ms,
    });
  });

  const failed = entries.filter((entry) => entry.outcome === "fail").length;
  return {
    at: new Date().toISOString(),
    environment: runtime.label,
    failed,
    entries,
  };
}
