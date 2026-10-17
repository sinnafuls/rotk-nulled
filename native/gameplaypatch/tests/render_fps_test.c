#include "../dinput8_proxy.c"
#undef NDEBUG
#include <assert.h>

static HWND test_window;
static HRESULT test_result = S_OK;
static unsigned int fallback_calls;
static char returned[128];
static HRESULT STDMETHODCALLTYPE test_desc(IDXGISwapChain *chain, DXGI_SWAP_CHAIN_DESC *desc) {
    (void)chain;
    memset(desc, 0, sizeof(*desc)); desc->OutputWindow = test_window;
    return S_OK;
}
static HRESULT STDMETHODCALLTYPE test_present(IDXGISwapChain *chain, UINT interval, UINT flags) {
    (void)chain; (void)interval; (void)flags; return test_result;
}
static void test_fallback(BYTE *movie, BYTE *args, unsigned int count, BYTE *result) {
    (void)movie; (void)args; (void)count; (void)result; ++fallback_calls;
}
static BYTE *test_impl(BYTE *movie) { return movie; }
static void test_string(BYTE *movie, BYTE *value, const char *text) {
    (void)movie; (void)value; snprintf(returned, sizeof(returned), "%s", text);
}
static void argument(BYTE *args, unsigned int at, const char *text, BOOL managed) {
    uint32_t type = managed ? 0x46 : 6;
    memcpy(args + at * 48 + 0x18, &type, sizeof(type));
    memcpy(args + at * 48 + 0x20, &text, sizeof(text));
}
int main(void) {
    IDXGISwapChainVtbl table = {0};
    IDXGISwapChain primary = {&table}, auxiliary = {&table};
    uintptr_t movie_vtable[43] = {0};
    BYTE movie[8], args[144] = {0}, result[48] = {0};
    uintptr_t vtable = (uintptr_t)movie_vtable;
    const char *managed_key = "RenderedFramesV1";
    uint64_t generation, frames;
    long long ticks, frequency;
    table.GetDesc = test_desc;
    fps_original_present = test_present;
    fps_original_option = test_fallback;
    QueryPerformanceFrequency(&fps_frequency);
    test_window = CreateWindowExW(0, L"STATIC", L"", WS_POPUP, 0, 0, 800, 600, NULL, NULL, GetModuleHandleW(NULL), NULL);
    assert(test_window);
    InterlockedExchange(&fps_enabled, 1);
    for (unsigned int i = 0; i < 1200; ++i) assert(fps_present(&primary, 0, 0) == S_OK);
    assert(fps_frames == 1200 && fps_generation == 1);
    fps_present(&primary, 0, DXGI_PRESENT_TEST);
    test_result = DXGI_STATUS_OCCLUDED; fps_present(&primary, 0, 0);
    test_result = E_FAIL; fps_present(&primary, 0, 0);
    test_result = S_OK; fps_present(&auxiliary, 0, 0);
    assert(fps_frames == 1200);
    fps_last_present.QuadPart -= fps_frequency.QuadPart * 2;
    fps_present(&auxiliary, 0, 0);
    assert(fps_generation == 2 && fps_frames == 1);
    movie_vtable[42] = (uintptr_t)test_impl; memcpy(movie, &vtable, 8);
    fps_base = (BYTE *)((uintptr_t)test_string - 0xba36b);
    argument(args, 0, "ROTKRuntime", FALSE);
    argument(args, 1, (const char *)&managed_key, TRUE);
    fps_option(movie, args, 3, result);
    assert(sscanf(returned, "1,%llu,%llu,%lld,%lld", (unsigned long long *)&generation,
        (unsigned long long *)&frames, &ticks, &frequency) == 4);
    assert(generation == 2 && frames == 1 && frequency == fps_frequency.QuadPart && ticks > 0);
    assert(fallback_calls == 0);
    fps_option(movie, args, 2, result); assert(fallback_calls == 1);
    argument(args, 0, "UI", FALSE); fps_option(movie, args, 3, result); assert(fallback_calls == 2);
    argument(args, 0, "ROTKRuntime", FALSE);
    fps_last_present.QuadPart -= fps_frequency.QuadPart * 2;
    fps_option(movie, args, 3, result); assert(!strncmp(returned, "1,0,", 4));
    InterlockedExchange(&fps_enabled, 0);
    fps_option(movie, args, 3, result); assert(fallback_calls == 3);
    fps_present(&auxiliary, 0, 0); assert(fps_frames == 1);
    DestroyWindow(test_window);
    {
        BYTE *image = VirtualAlloc(NULL, 0x1c19000, MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
        DWORD protection;
        DWORD64 unwind_base;
        const BYTE prologue[] = {0x48,0x8b,0xc4,0x55,0x41,0x54,0x41,0x55,0x41,0x56,0x41,0x57,
            0x48,0x8d,0xa8,0x58,0xfe,0xff,0xff,0x48,0x81,0xec,0x80,0x02,0x00,0x00};
        const BYTE return_tag[] = {0x41,0xc7,0x01,0x78,0x56,0x34,0x12,
            0x48,0x81,0xc4,0x80,0x02,0x00,0x00,0x41,0x5f,0x41,0x5e,0x41,0x5d,0x41,0x5c,0x5d,0xc3};
        const BYTE getter[] = {0xe9,0xfc,0xce,0xb8,0x01}, string[] = {0xe9,0x20,0x4a,0xd0,0x01};
        assert(image);
        memcpy(image + 0x1c18b10, prologue, sizeof(prologue));
        memcpy(image + 0x1c18b10 + sizeof(prologue), return_tag, sizeof(return_tag));
        memcpy(image + 0x8bc0f, getter, sizeof(getter));
        memcpy(image + 0xba36b, string, sizeof(string));
        assert(VirtualProtect(image, 0x1c19000, PAGE_EXECUTE_READ, &protection));
        assert(FlushInstructionCache(GetCurrentProcess(), image, 0x1c19000));
        assert(fps_hook_option(image));
        assert(RtlLookupFunctionEntry((DWORD64)(uintptr_t)fps_original_option + 4, &unwind_base, NULL) == &fps_unwind);
        assert(unwind_base == (DWORD64)(uintptr_t)fps_original_option);
        for (unsigned int i = 0; i < 10000; ++i) {
            memset(result, 0, sizeof(result));
            ((fps_option_fn)(uintptr_t)(image + 0x8bc0f))(NULL, NULL, 0, result);
            assert(*(uint32_t *)result == 0x12345678);
        }
    }
    puts("PASS: real presentation counting, failed/test/auxiliary exclusions, chain reset, managed GFx strings, stale/disabled provider, stock binding fallback.");
    return 0;
}
