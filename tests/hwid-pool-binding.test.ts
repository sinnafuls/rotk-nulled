import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ATTESTATION_TEST_VECTORS,
  TPM_BINDING_DOMAIN,
  challengeSigningInput,
  tpmBindingMessage,
  verifyAttestationSignature,
} from "../shared/attestation";
import { requestAttestationChallenge } from "../electron/services/integrity-attestation";

const CHALLENGE_ID = "7c9e6679742540de944be07fc1f90ae7";
const PLAYER_KEY = "0123456789abcdef0123456789abcdef";
const ENDPOINT = "https://accounts.rotk.app/api/launcher/attestation/challenge";

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return { privateKey, publicKeyRaw: spki.subarray(spki.length - 32).toString("base64url") };
}

const baseChallenge = {
  challengeId: CHALLENGE_ID,
  nonce: "dGVzdC1ub25jZS0xMjM0NTY3ODkw",
  policyVersion: "2026.09.10-0001",
  packVersion: "1.5.0",
  baseBuildId: "1.0.326.439939",
  minLauncherVersion: "1.4.5",
  expiresAt: "2026-09-10T00:15:00.000Z",
  keyId: "test-key",
};

function signed(challenge: Record<string, unknown>, privateKey: ReturnType<typeof keyPair>["privateKey"]) {
  const signature = signPayload(
    null,
    Buffer.from(challengeSigningInput(challenge as Parameters<typeof challengeSigningInput>[0]), "utf8"),
    privateKey,
  ).toString("base64url");
  return { ...challenge, signature };
}

function serving(payload: unknown): typeof fetch {
  return (async () => new Response(
    JSON.stringify(payload),
    { status: 200, headers: { "content-type": "application/json" } },
  )) as unknown as typeof fetch;
}

describe("challenge signing input with fingerprint slots (#320 §B)", () => {
  it("is byte-identical to the pre-pool bytes when no slots are named", () => {
    const withoutField = challengeSigningInput(baseChallenge);
    const withUndefined = challengeSigningInput({ ...baseChallenge, hwidSlots: undefined });
    expect(withUndefined).toBe(withoutField);
    expect(withoutField.split("\0")).toHaveLength(5);
  });

  it("appends the slot list as one extra field, so the server's choice is signed", () => {
    const input = challengeSigningInput({ ...baseChallenge, hwidSlots: ["machine_guid", "bios_serial"] });
    expect(input.endsWith("\0machine_guid,bios_serial")).toBe(true);
    expect(input.split("\0")).toHaveLength(6);
    const { privateKey, publicKeyRaw } = keyPair();
    const trusted = { "test-key": publicKeyRaw };
    const signature = signPayload(null, Buffer.from(input, "utf8"), privateKey).toString("base64url");
    expect(verifyAttestationSignature(input, signature, "test-key", trusted)).toBe(true);
    // Swapping one slot after signing is a different message.
    const edited = challengeSigningInput({ ...baseChallenge, hwidSlots: ["machine_guid", "gpu_name"] });
    expect(verifyAttestationSignature(edited, signature, "test-key", trusted)).toBe(false);
  });
});

describe("challenge parsing with fingerprint slots", () => {
  it("accepts a signed slot list and hands it to the caller", async () => {
    const { privateKey, publicKeyRaw } = keyPair();
    const challenge = signed({ ...baseChallenge, hwidSlots: ["machine_guid", "smbios_uuid", "bios_serial"] }, privateKey);
    const parsed = await requestAttestationChallenge(PLAYER_KEY, ENDPOINT, "2.0.12", {
      fetchImpl: serving(challenge),
      trustedKeys: { "test-key": publicKeyRaw },
    });
    expect(parsed.hwidSlots).toEqual(["machine_guid", "smbios_uuid", "bios_serial"]);
  });

  it("leaves hwidSlots undefined on a challenge that names none", async () => {
    const { privateKey, publicKeyRaw } = keyPair();
    const parsed = await requestAttestationChallenge(PLAYER_KEY, ENDPOINT, "2.0.12", {
      fetchImpl: serving(signed(baseChallenge, privateKey)),
      trustedKeys: { "test-key": publicKeyRaw },
    });
    expect(parsed.hwidSlots).toBeUndefined();
  });

  it("refuses a slot list edited after signing — a spoofed backend cannot choose what is disclosed", async () => {
    const { privateKey, publicKeyRaw } = keyPair();
    const challenge = signed({ ...baseChallenge, hwidSlots: ["machine_guid"] }, privateKey);
    await expect(requestAttestationChallenge(PLAYER_KEY, ENDPOINT, "2.0.12", {
      fetchImpl: serving({ ...challenge, hwidSlots: ["machine_guid", "mac_addresses"] }),
      trustedKeys: { "test-key": publicKeyRaw },
    })).rejects.toThrow(/not signed by a trusted key/);
    // Slots added to a challenge that was signed without any: same refusal.
    await expect(requestAttestationChallenge(PLAYER_KEY, ENDPOINT, "2.0.12", {
      fetchImpl: serving({ ...signed(baseChallenge, privateKey), hwidSlots: ["machine_guid"] }),
      trustedKeys: { "test-key": publicKeyRaw },
    })).rejects.toThrow(/not signed by a trusted key/);
  });

  it("rejects malformed slot lists before looking at the signature", async () => {
    const { privateKey, publicKeyRaw } = keyPair();
    // Signed without slots, then a malformed list bolted on: the shape check
    // refuses before the signature is even considered.
    const validlySigned = signed(baseChallenge, privateKey);
    for (const hwidSlots of [
      [],
      ["Machine Guid"],
      ["machine_guid", "machine_guid"],
      ["x".repeat(41)],
      "machine_guid",
      Array.from({ length: 41 }, (_, index) => `slot_${index}`),
      [42],
    ]) {
      await expect(requestAttestationChallenge(PLAYER_KEY, ENDPOINT, "2.0.12", {
        fetchImpl: serving({ ...validlySigned, hwidSlots }),
        trustedKeys: { "test-key": publicKeyRaw },
      })).rejects.toThrow(/Invalid attestation challenge/);
    }
  });
});

describe("TPM binding message (#320 §C)", () => {
  it("matches the frozen cross-implementation vector", () => {
    const vector = ATTESTATION_TEST_VECTORS.tpmBinding;
    expect(tpmBindingMessage(vector.challengeId, vector.hwid)).toBe(vector.expectedMessage);
  });

  it("covers the challengeId and every string slot as sent, keys sorted, nothing normalised", () => {
    const message = tpmBindingMessage(CHALLENGE_ID, { b: " Two ", a: "one", n: 1, o: null });
    expect(message).toBe(`${TPM_BINDING_DOMAIN}\0${CHALLENGE_ID}\0a=one\0b= Two `);
    expect(tpmBindingMessage(CHALLENGE_ID, {})).toBe(`${TPM_BINDING_DOMAIN}\0${CHALLENGE_ID}`);
    expect(tpmBindingMessage(CHALLENGE_ID, undefined)).toBe(`${TPM_BINDING_DOMAIN}\0${CHALLENGE_ID}`);
    expect(tpmBindingMessage(CHALLENGE_ID, ["not", "an", "object"])).toBe(`${TPM_BINDING_DOMAIN}\0${CHALLENGE_ID}`);
  });

  it("changes when a slot value, a slot name or the challenge changes", () => {
    const reference = tpmBindingMessage(CHALLENGE_ID, { machine_guid: "a", volume_serial: "b" });
    expect(tpmBindingMessage(CHALLENGE_ID, { machine_guid: "a", volume_serial: "c" })).not.toBe(reference);
    expect(tpmBindingMessage(CHALLENGE_ID, { machine_guid: "a", disk_serial: "b" })).not.toBe(reference);
    expect(tpmBindingMessage("b".repeat(32), { machine_guid: "a", volume_serial: "b" })).not.toBe(reference);
  });
});
