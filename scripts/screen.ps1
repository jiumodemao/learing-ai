Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$w = [System.Windows.Forms.SystemInformation]::VirtualScreen.Width
$h = [System.Windows.Forms.SystemInformation]::VirtualScreen.Height
$b = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen(0, 0, 0, 0, $b.Size)
$b.Save("C:/Users/BOZI/AppData/Local/Temp/screen.png")
$g.Dispose()
$b.Dispose()
