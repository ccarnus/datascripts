// Windows folder picker (the Explorer-style "Select Folder" dialog), through PowerShell.
// Resolves null if the dialog is cancelled; throws if it can't be shown (caller falls back to typing).
const { spawn } = require('child_process');

// IFileOpenDialog in folder mode. Methods must stay in vtable order (up to GetResult).
const CSHARP = `
using System;
using System.Runtime.InteropServices;
public static class BrightMindsFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialog {}
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint count, IntPtr specs);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem item);
    void SetFolder(IShellItem item);
    void GetFolder(out IShellItem item);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr bc, ref Guid handler, ref Guid iid, out IntPtr result);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint type, [MarshalAs(UnmanagedType.LPWStr)] out string name);
  }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr bc, ref Guid iid, out IShellItem item);

  public static string Pick(string title, string initialFolder) {
    var dialog = (IFileDialog)new FileOpenDialog();
    dialog.SetOptions(0x20 | 0x40); // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
    dialog.SetTitle(title);
    if (!String.IsNullOrEmpty(initialFolder) && System.IO.Directory.Exists(initialFolder)) {
      Guid iid = typeof(IShellItem).GUID;
      IShellItem folder;
      SHCreateItemFromParsingName(initialFolder, IntPtr.Zero, ref iid, out folder);
      dialog.SetFolder(folder);
    }
    int hr = dialog.Show(GetForegroundWindow()); // owned by the terminal: opens in front of it
    if (hr == unchecked((int)0x800704C7)) return null; // cancelled
    Marshal.ThrowExceptionForHR(hr);
    IShellItem result;
    dialog.GetResult(out result);
    string path;
    result.GetDisplayName(0x80058000, out path); // SIGDN_FILESYSPATH
    return path;
  }
}`;

const SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try {
Add-Type -TypeDefinition @'
${CSHARP}
'@
$path = [BrightMindsFolderPicker]::Pick($env:BM_PICKER_TITLE, $env:BM_PICKER_INITIAL)
if ($path) { [Console]::Out.Write($path) }
} catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}
`;

let lastFolder;

/**
 * @param {string} title Dialog title.
 * @returns {Promise<string|null>} The chosen folder, or null if cancelled.
 */
const pickFolder = (title) =>
  new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('folder dialog needs Windows'));
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        Buffer.from(SCRIPT, 'utf16le').toString('base64'),
      ],
      {
        env: { ...process.env, BM_PICKER_TITLE: title, BM_PICKER_INITIAL: lastFolder || '' },
        windowsHide: true,
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr.trim().split('\n')[0] || `exit ${code}`));
      const folder = stdout.trim() || null;
      if (folder) lastFolder = folder;
      return resolve(folder);
    });
  });

module.exports = { pickFolder, SCRIPT };
