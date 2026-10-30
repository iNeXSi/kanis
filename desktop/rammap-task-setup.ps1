# Only one fixed Microsoft executable is registered. No triggers, scripts or supplied run parameters.
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if ($sid -ne $expectedSid) { throw 'Use administrator approval for the same signed-in account' }
$taskName = 'Kanis RAMMap ' + $sid
$programs = [Environment]::GetFolderPath('ProgramFiles')
$directory = Join-Path $programs 'KanisRAMMap'
$target = Join-Path $directory 'RAMMap64.exe'
function AssertOriginal([string]$file) {
  $item = Get-Item -LiteralPath $file -ErrorAction Stop
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point rejected' }
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Unexpected file' }
  $signature = Get-AuthenticodeSignature -LiteralPath $file
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '^CN=Microsoft Corporation,') { throw 'Signature rejected' }
}
AssertOriginal $sourceFile
# Reuse a license acceptance already made by this user in RAMMap's own UI.
if ((Get-ItemPropertyValue -LiteralPath 'HKCU:\Software\Sysinternals\RAMMap' -Name EulaAccepted -ErrorAction SilentlyContinue) -ne 1) { throw 'Accept the RAMMap license in the manual tool first' }
if ((Get-Item -LiteralPath $programs).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected Program Files location' }
if (Test-Path -LiteralPath $directory) {
  if ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected directory' }
  $owner = (Get-Acl -LiteralPath $directory).GetOwner([Security.Principal.SecurityIdentifier]).Value
  if ($owner -notin @('S-1-5-18','S-1-5-32-544')) { throw 'Unexpected directory owner' }
} else {
  New-Item -ItemType Directory -Path $directory -ErrorAction Stop | Out-Null
}
$directoryAcl = New-Object Security.AccessControl.DirectorySecurity
$directoryAcl.SetSecurityDescriptorSddlForm('O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FRFX;;;BU)')
Set-Acl -LiteralPath $directory -AclObject $directoryAcl
if ((Test-Path -LiteralPath $target) -and ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unexpected target' }
Copy-Item -LiteralPath $sourceFile -Destination $target -Force
$fileAcl = New-Object Security.AccessControl.FileSecurity
$fileAcl.SetSecurityDescriptorSddlForm('O:BAG:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FRFX;;;BU)')
Set-Acl -LiteralPath $target -AclObject $fileAcl
AssertOriginal $target
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder = $service.GetFolder('\')
$definition = $service.NewTask(0)
$definition.RegistrationInfo.Description = 'Kanis: on-demand Microsoft RAMMap working-set trim; no time triggers.'
$definition.Principal.UserId = $sid
$definition.Principal.LogonType = 3 # Interactive token: no stored password, only while signed in.
$definition.Principal.RunLevel = 1
$definition.Settings.Enabled = $true
$definition.Settings.AllowDemandStart = $true
$definition.Settings.DisallowStartIfOnBatteries = $false
$definition.Settings.StopIfGoingOnBatteries = $false
$definition.Settings.ExecutionTimeLimit = 'PT2M'
$definition.Settings.MultipleInstances = 2 # IgnoreNew.
$definition.Settings.StartWhenAvailable = $false
$action = $definition.Actions.Create(0)
$action.Path = $target
$action.Arguments = '/accepteula -Ew'
$action.WorkingDirectory = $directory
# Current user can read/execute, but only Administrators/System can change the elevated action.
$sddl = "O:BAG:BAD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGX;;;$sid)"
$null = $folder.RegisterTaskDefinition($taskName,$definition,22,$sid,$null,3,$sddl)
exit 0
