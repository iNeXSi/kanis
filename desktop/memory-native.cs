using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Collections.Generic;

// All validation and the trim use the same process handle, including creation time.
// No debug privilege, process termination, system cache flushing or elevation.
public static class KanisMemory {
    delegate bool WindowVisitor(IntPtr window, IntPtr state);
    [DllImport("user32.dll")] static extern bool EnumWindows(WindowVisitor visitor, IntPtr state);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int id);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr handle, out long creation, out long exit, out long kernel, out long user);
    [DllImport("kernel32.dll")] static extern bool IsProcessCritical(IntPtr handle, out bool critical);
    [DllImport("kernel32.dll")] static extern bool ProcessIdToSessionId(uint id, out uint session);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr handle, int flags, StringBuilder name, ref int length);
    [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr handle, uint access, out IntPtr token);
    [DllImport("kernel32.dll")] static extern bool K32EmptyWorkingSet(IntPtr handle);
    [DllImport("kernel32.dll")] static extern bool K32GetProcessMemoryInfo(IntPtr handle, out Counters counters, uint size);
    [StructLayout(LayoutKind.Sequential)] struct Counters {
        public uint cb, faults;
        public UIntPtr peak, working, pagedPeak, paged, nonPagedPeak, nonPaged, pageFile, pageFilePeak;
    }
    public class Row {
        public int pid;
        public string created, name, status;
        public long before;
        public long? after;
        public bool? hasVisibleWindow;
    }
    static string Owner = WindowsIdentity.GetCurrent().User.Value;
    static int Session = Process.GetCurrentProcess().SessionId;
    static string WindowsRoot = Environment.GetFolderPath(Environment.SpecialFolder.Windows).TrimEnd('\\') + "\\";
    static HashSet<int> VisibleProcesses() {
        var visible = new HashSet<int>();
        bool known = EnumWindows((window,state)=>{
            if(IsWindowVisible(window)) {
                uint owner;
                if(GetWindowThreadProcessId(window,out owner)!=0) visible.Add((int)owner);
            }
            return true;
        },IntPtr.Zero);
        return known ? visible : null;
    }
    static Row Inspect(IntPtr handle, int id, string excludedExe) {
        bool critical;
        if(!IsProcessCritical(handle, out critical) || critical) throw new Exception("PROTECTED");
        IntPtr token;
        if(!OpenProcessToken(handle, 8, out token)) throw new Exception("PROTECTED");
        try { using(var identity = new WindowsIdentity(token)) {
            if(identity.User.Value != Owner) throw new Exception("PROTECTED");
        }} finally { CloseHandle(token); }
        uint session;
        if(!ProcessIdToSessionId((uint)id, out session) || session != Session) throw new Exception("PROTECTED");
        var name = new StringBuilder(32768); int length = name.Capacity;
        if(!QueryFullProcessImageName(handle, 0, name, ref length)) throw new Exception("PROTECTED");
        string file = name.ToString();
        if(file.StartsWith(WindowsRoot, StringComparison.OrdinalIgnoreCase) ||
           file.Equals(excludedExe, StringComparison.OrdinalIgnoreCase) ||
           id == Process.GetCurrentProcess().Id) throw new Exception("PROTECTED");
        long creation, exit, kernel, user;
        if(!GetProcessTimes(handle, out creation, out exit, out kernel, out user) || exit != 0) throw new Exception("EXITED");
        return new Row { pid=id, created=creation.ToString(), name=System.IO.Path.GetFileName(file), before=Read(handle), status="ready" };
    }
    static long Read(IntPtr handle) {
        Counters counters;
        if(!K32GetProcessMemoryInfo(handle, out counters, (uint)Marshal.SizeOf(typeof(Counters)))) throw new Exception("UNAVAILABLE");
        return checked((long)counters.working.ToUInt64());
    }
    public static Row[] List(string excludedExe) {
        var rows = new List<Row>();
        var visible = VisibleProcesses();
        foreach(var process in Process.GetProcesses()) {
            using(process) {
                IntPtr handle = OpenProcess(0x1000, false, process.Id);
                if(handle == IntPtr.Zero) continue;
                try {
                    var row = Inspect(handle, process.Id, excludedExe);
                    row.hasVisibleWindow = visible != null ? (bool?)visible.Contains(process.Id) : null;
                    if(row.before >= 1024*1024) rows.Add(row);
                } catch { /* Exited, system, other-user and inaccessible processes are omitted. */ }
                finally { CloseHandle(handle); }
            }
        }
        rows.Sort((a,b)=>b.before.CompareTo(a.before));
        return rows.ToArray();
    }
    public static Row Trim(int id, string expectedCreation, string excludedExe) {
        return Trim(id, expectedCreation, excludedExe, false);
    }
    public static Row Trim(int id, string expectedCreation, string excludedExe, bool backgroundOnly) {
        var result = new Row {pid=id, created=expectedCreation, status="skipped"};
        IntPtr handle = OpenProcess(0x1100, false, id);
        if(handle == IntPtr.Zero) return result;
        try {
            var current = Inspect(handle, id, excludedExe);
            if(current.created != expectedCreation) return result;
            result = current; result.status = "skipped";
            if(backgroundOnly) {
                var visible = VisibleProcesses();
                if(visible == null || visible.Contains(id)) return result;
            }
            if(!K32EmptyWorkingSet(handle)) return result;
            result.status = "trimmed";
            try { result.after=Read(handle); } catch { result.after=null; }
            return result;
        } catch { return result; }
        finally { CloseHandle(handle); }
    }
}
