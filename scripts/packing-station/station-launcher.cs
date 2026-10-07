using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

// A windowless executable prevents Windows Terminal from hosting our background
// PowerShell process. -WindowStyle Hidden alone still creates a console host.
internal static class StationLauncher
{
    [STAThread]
    private static int Main()
    {
        string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        try
        {
            var start = new ProcessStartInfo
            {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
                    @"WindowsPowerShell\v1.0\powershell.exe"),
                Arguments = "-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -WindowStyle Hidden -File \""
                    + Path.Combine(root, "run-background.ps1") + "\"",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            using (var child = Process.Start(start))
            {
                child.WaitForExit();
                return child.ExitCode;
            }
        }
        catch
        {
            try { File.AppendAllText(Path.Combine(root, "startup-error.log"),
                DateTimeOffset.Now.ToString("o") + " Background launcher failed. Re-run station setup."
                + Environment.NewLine); } catch { }
            return 1;
        }
    }
}
