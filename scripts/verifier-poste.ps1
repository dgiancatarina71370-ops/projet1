# BA-Mentor V2.0 - verification d'un poste Windows. A lancer depuis la cle USB :
#   powershell -ExecutionPolicy Bypass -File .\verifier-poste.ps1
# N'ecrit qu'un fichier texte a cote du script.
$out = Join-Path $PSScriptRoot ("poste-" + $env:COMPUTERNAME + ".txt")
$os = Get-CimInstance Win32_OperatingSystem
$lines = @()
$lines += "Machine : $env:COMPUTERNAME"
$lines += "Windows : $($os.Caption) build $($os.BuildNumber) ($($os.OSArchitecture))"
$lines += "Date    : $(Get-Date -Format s)"
# WebView2 (Evergreen) : version installee, machine ou utilisateur
$guid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$keys = @("HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$guid","HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$guid","HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$guid")
$wv = $null
foreach ($k in $keys) { $v = (Get-ItemProperty -Path $k -ErrorAction SilentlyContinue).pv; if ($v) { $wv = "$v  ($k)"; break } }
$lines += "WebView2 : " + $(if ($wv) { $wv } else { "ABSENT (le runtime doit etre installe ou fourni en version fixe)" })
# Support de la cle
$drive = (Split-Path -Qualifier $PSScriptRoot)
$vol = Get-Volume -DriveLetter $drive.TrimEnd(':') -ErrorAction SilentlyContinue
if ($vol) { $lines += "Support : $drive  systeme de fichiers=$($vol.FileSystem)  type=$($vol.DriveType)  libre=$([math]::Round($vol.SizeRemaining/1GB,1)) Go" }
# Vitesse d'ecriture synchrone : 200 petites ecritures avec vidage disque
$f = Join-Path $PSScriptRoot "vitesse.tmp"; $sw = [Diagnostics.Stopwatch]::StartNew()
$fs = [IO.File]::Open($f,'Create','Write','None',[IO.FileOptions]::WriteThrough); $b = [byte[]](1..4096 | % { 65 })
1..200 | % { $fs.Write($b,0,$b.Length); $fs.Flush($true) }; $fs.Close(); $sw.Stop(); Remove-Item $f
$lines += "200 ecritures synchrones de 4 Ko : $($sw.ElapsedMilliseconds) ms"
# Politique d'execution applicative eventuelle
$lines += "AppLocker/WDAC : voir la reaction au lancement de l'exe (blocage = a noter)"
$lines | Tee-Object -FilePath $out
Write-Host "`nResultat enregistre dans $out"
