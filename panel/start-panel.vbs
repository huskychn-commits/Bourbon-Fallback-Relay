' Start the generic panel on Windows (default: http://127.0.0.1:3134).
' Public launcher: all paths are relative to this file, no local state.
' Usage: double-click, or: cscript //nologo start-panel.vbs /no-open
Option Explicit
Dim sh, fso, here, root, server, port, url, py, cmd, i

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(here)
server = here & "\server.py"

port = Trim(sh.Environment("PROCESS")("EMERGENCY_PANEL_PORT"))
If port = "" Then port = "3134"
If Not IsNumeric(port) Then Fail "EMERGENCY_PANEL_PORT must be a number."
url = "http://127.0.0.1:" & port

If Not fso.FileExists(server) Then
  Fail "server.py not found next to this launcher:" & vbCrLf & server
End If

If IsUp() Then
  If Not WScript.Arguments.Named.Exists("no-open") Then sh.Run url, 1, False
  WScript.Quit 0
End If

py = Trim(sh.Environment("PROCESS")("PANEL_PYTHON"))
If py <> "" Then
  If Not CommandWorks(py) Then
    Fail "PANEL_PYTHON is set but does not run Python 3.8+:" & vbCrLf & py
  End If
ElseIf CommandWorks("pythonw") Then
  py = "pythonw"
ElseIf CommandWorks("python") Then
  py = "python"
ElseIf CommandWorks("py -3") Then
  py = "py -3"
Else
  Fail "Python 3.8+ was not found." & vbCrLf & vbCrLf & _
       "Install Python, or set PANEL_PYTHON to python.exe / pythonw.exe."
End If

If fso.FileExists(py) Then
  cmd = """" & py & """ """ & server & """"
ElseIf InStr(py, " ") > 0 Then
  cmd = "cmd /c " & py & " """ & server & """"
Else
  cmd = """" & py & """ """ & server & """"
End If

sh.CurrentDirectory = root
sh.Run cmd, 0, False

For i = 1 To 30
  If IsUp() Then
    If Not WScript.Arguments.Named.Exists("no-open") Then sh.Run url, 1, False
    WScript.Quit 0
  End If
  WScript.Sleep 500
Next

Fail "Panel did not start on port " & port & "." & vbCrLf & _
     "Run it manually to see the Python error:" & vbCrLf & _
     "python """ & server & """"

Sub Fail(message)
  If WScript.Arguments.Named.Exists("no-open") Then
    WScript.Echo message
  Else
    MsgBox message, 16, "Bourbon Fallback Relay"
  End If
  WScript.Quit 1
End Sub

Function IsUp()
  Dim http
  IsUp = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 800, 800, 800, 800
  http.open "GET", url & "/api/state", False
  http.send
  If Err.Number = 0 Then
    If http.status = 200 Then IsUp = True
  End If
  Err.Clear
  On Error GoTo 0
End Function

Function CommandWorks(spec)
  Dim ex, rc, cmdline
  CommandWorks = False
  If fso.FileExists(spec) Then
    cmdline = """" & spec & """ -c ""import sys;sys.exit(0 if sys.version_info>=(3,8) else 1)"""
  Else
    cmdline = "cmd /c " & spec & " -c ""import sys;sys.exit(0 if sys.version_info>=(3,8) else 1)"""
  End If
  On Error Resume Next
  Set ex = sh.Exec(cmdline)
  If Err.Number <> 0 Then Exit Function
  Do While ex.Status = 0
    WScript.Sleep 25
  Loop
  rc = ex.ExitCode
  Err.Clear
  On Error GoTo 0
  CommandWorks = (rc = 0)
End Function
