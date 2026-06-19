/*
 * launcher.c — Windows CodePathWin launcher for StreamDock node plugins.
 *
 * StreamDock (HotSpot / Fifine / Mirabox) on Windows launches a plugin's
 * CodePathWin as a NATIVE process via CreateProcess. It does NOT run a ".js"
 * path through a bundled node (unlike what the bundled node20.exe suggests),
 * so a plugin whose CodePathWin points straight at index.js never starts and
 * the host restarts it forever ("SDPluginManager::restartPlugin ... N").
 *
 * This is the Windows counterpart of the macOS `run` bash wrapper: a tiny
 * native exe the host CAN execute, which locates the StreamDock-bundled node
 * and execs the plugin's own index.js, forwarding the SDK arguments verbatim
 * (-port -pluginUUID -registerEvent -info <json>).
 *
 * It is generic: it runs the `index.js` that sits next to itself, so the same
 * launch.exe works for every node plugin in this repo. Built by build.sh /
 * build.ps1 via a Docker mingw-w64 cross-compiler — no toolchain on the host.
 *
 *   x86_64-w64-mingw32-gcc -O2 -s -mwindows launcher.c -o launch.exe
 */

#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>

static int fileExists(const wchar_t *p) {
  DWORD a = GetFileAttributesW(p);
  return (a != INVALID_FILE_ATTRIBUTES) && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

int main(void) {
  /* Our own directory == the plugin/ folder that also holds index.js. */
  wchar_t dir[MAX_PATH];
  GetModuleFileNameW(NULL, dir, MAX_PATH);
  wchar_t *slash = wcsrchr(dir, L'\\');
  if (slash) *slash = 0;

  wchar_t script[MAX_PATH];
  swprintf(script, MAX_PATH, L"%ls\\index.js", dir);

  /* Locate a node runtime. Prefer SD_NODE, then the node bundled with the
   * StreamDock host, then whatever "node.exe" is on PATH. */
  const wchar_t *candidates[] = {
    L"C:\\Program Files (x86)\\fifine Control Deck\\node\\node20.exe",
    L"C:\\Program Files\\fifine Control Deck\\node\\node20.exe",
    L"C:\\Program Files (x86)\\StreamDock\\node\\node20.exe",
    L"C:\\Program Files\\StreamDock\\node\\node20.exe",
    L"C:\\Program Files\\Mirabox\\Stream Dock\\node\\node20.exe",
    L"C:\\Program Files (x86)\\Mirabox\\Stream Dock\\node\\node20.exe",
  };
  wchar_t envNode[MAX_PATH];
  envNode[0] = 0;
  DWORD en = GetEnvironmentVariableW(L"SD_NODE", envNode, MAX_PATH);
  const wchar_t *node = NULL;
  if (en > 0 && en < MAX_PATH && fileExists(envNode)) node = envNode;
  for (size_t i = 0; !node && i < sizeof(candidates) / sizeof(candidates[0]); i++)
    if (fileExists(candidates[i])) node = candidates[i];
  const wchar_t *nodeExe = node ? node : L"node.exe"; /* PATH fallback */

  /* Forward the host's arguments verbatim: take the full command line and drop
   * just our own argv[0] token, preserving the -info JSON's exact quoting. */
  wchar_t *rest = GetCommandLineW();
  if (*rest == L'"') {
    rest++;
    while (*rest && *rest != L'"') rest++;
    if (*rest == L'"') rest++;
  } else {
    while (*rest && *rest != L' ' && *rest != L'\t') rest++;
  }

  /* Child command line:  "node" "script"<rest> */
  size_t len = wcslen(nodeExe) + wcslen(script) + wcslen(rest) + 16;
  wchar_t *cmd = (wchar_t *)malloc(len * sizeof(wchar_t));
  if (!cmd) return 1;
  swprintf(cmd, len, L"\"%ls\" \"%ls\"%ls", nodeExe, script, rest);

  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si));
  si.cb = sizeof(si);
  ZeroMemory(&pi, sizeof(pi));

  if (!CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW,
                      NULL, dir, &si, &pi)) {
    /* Leave a breadcrumb next to the plugin so failures are diagnosable. */
    wchar_t errPath[MAX_PATH];
    swprintf(errPath, MAX_PATH, L"%ls\\launch-error.log", dir);
    HANDLE h = CreateFileW(errPath, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, NULL);
    if (h != INVALID_HANDLE_VALUE) {
      char buf[1024];
      int wlen = WideCharToMultiByte(CP_UTF8, 0, cmd, -1, NULL, 0, NULL, NULL);
      char *u8 = (char *)malloc(wlen > 0 ? wlen : 1);
      DWORD wrote;
      int n = snprintf(buf, sizeof(buf),
                       "CreateProcess failed (err %lu). node=%ls\n",
                       GetLastError(), nodeExe);
      WriteFile(h, buf, (DWORD)n, &wrote, NULL);
      if (u8 && wlen > 0) {
        WideCharToMultiByte(CP_UTF8, 0, cmd, -1, u8, wlen, NULL, NULL);
        WriteFile(h, u8, (DWORD)(wlen - 1), &wrote, NULL);
      }
      free(u8);
      CloseHandle(h);
    }
    return 1;
  }

  /* Stay alive for the child's lifetime so the host sees one plugin process. */
  WaitForSingleObject(pi.hProcess, INFINITE);
  DWORD code = 0;
  GetExitCodeProcess(pi.hProcess, &code);
  CloseHandle(pi.hProcess);
  CloseHandle(pi.hThread);
  return (int)code;
}
