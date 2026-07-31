$code = @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Drawing;

public class SmartInputLock {
    private const int WH_KEYBOARD_LL = 13;
    private const int WH_MOUSE_LL = 14;
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_LAYERED = 0x00080000;

    private static HookProc _kProc = KHookCallback;
    private static HookProc _mProc = MHookCallback;
    private static IntPtr _kHook = IntPtr.Zero;
    private static IntPtr _mHook = IntPtr.Zero;
    private static Form _bannerForm = null;

    public delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT {
        public POINT pt;
        public uint mouseData;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT {
        public int x;
        public int y;
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    public static void RunLock() {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            IntPtr hMod = GetModuleHandle(curModule.ModuleName);
            _kHook = SetWindowsHookEx(WH_KEYBOARD_LL, _kProc, hMod, 0);
            _mHook = SetWindowsHookEx(WH_MOUSE_LL, _mProc, hMod, 0);
        }

        _bannerForm = new Form();
        _bannerForm.Text = "Lab Manager Lock Banner";
        _bannerForm.FormBorderStyle = FormBorderStyle.None;
        _bannerForm.StartPosition = FormStartPosition.Manual;
        _bannerForm.Location = new Point(0, 0);
        _bannerForm.Size = new Size(Screen.PrimaryScreen.Bounds.Width, 75);
        _bannerForm.TopMost = true;
        _bannerForm.BackColor = Color.Lime; // Transparency key
        _bannerForm.TransparencyKey = Color.Lime;
        _bannerForm.Opacity = 0.8;

        Label label = new Label();
        label.Text = "🔒 PERHATIAN: HAK AKSES CLIENT DIKUNCI OLEH ADMIN\nClient Dilarang Menggunakan PC | Remote Control Admin Aktif";
        label.Font = new Font("Segoe UI", 13, FontStyle.Bold);
        label.ForeColor = Color.Red;
        label.BackColor = Color.Black;
        label.AutoSize = true;
        label.TextAlign = ContentAlignment.MiddleCenter;
        _bannerForm.Controls.Add(label);

        _bannerForm.HandleCreated += (s, e) => {
            int style = GetWindowLong(_bannerForm.Handle, GWL_EXSTYLE);
            SetWindowLong(_bannerForm.Handle, GWL_EXSTYLE, style | WS_EX_TRANSPARENT | WS_EX_LAYERED);
        };

        Application.Run(_bannerForm);
    }

    private static IntPtr KHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            KBDLLHOOKSTRUCT k = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            bool isInjected = ((k.flags & 0x10) != 0);
            if (!isInjected) {
                return (IntPtr)1; // Block physical keyboard press from client
            }
        }
        return CallNextHookEx(_kHook, nCode, wParam, lParam);
    }

    private static IntPtr MHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            MSLLHOOKSTRUCT m = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
            bool isInjected = ((m.flags & 0x01) != 0);
            if (!isInjected) {
                return (IntPtr)1; // Block physical mouse input from client
            }
        }
        return CallNextHookEx(_mHook, nCode, wParam, lParam);
    }
}
'@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms,System.Drawing -ErrorAction SilentlyContinue
[SmartInputLock]::RunLock()
