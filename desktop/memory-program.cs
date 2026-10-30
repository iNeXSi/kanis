using System;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;

public static class KanisMemoryProgram {
    public class Selection { public int pid; public string created; }
    public static int Main(string[] args) {
        try {
            if(args.Length < 2) return 2;
            var json = new JavaScriptSerializer();
            object result;
            if(args[0] == "list" && args.Length == 2) {
                result = KanisMemory.List(args[1]).Take(40).ToArray();
            } else if((args[0] == "trim" || args[0] == "trim-background") && args.Length == 3 && args[2].Length < 16000) {
                var rows = json.Deserialize<Selection[]>(Encoding.UTF8.GetString(Convert.FromBase64String(args[2])));
                if(rows == null || rows.Length < 1 || rows.Length > 10 ||
                   rows.Any(row=>row == null || row.pid <= 0 || row.created == null ||
                     !System.Text.RegularExpressions.Regex.IsMatch(row.created, @"^\d{1,20}$"))) return 2;
                result = rows.Select(row=>KanisMemory.Trim(row.pid, row.created, args[1], args[0] == "trim-background")).ToArray();
            } else return 2;
            Console.OutputEncoding = new UTF8Encoding(false);
            Console.WriteLine(json.Serialize(result));
            return 0;
        } catch {
            Console.Error.WriteLine("MEMORY_UNAVAILABLE");
            return 1;
        }
    }
}
