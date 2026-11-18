#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#define MyAppName "Deadline Widget"
#define MyAppPublisher "AgentC0rn"
#define MyAppURL "https://github.com/AgentC0rn/deadline-widget"
#define MyAppExeName "DeadlineWidget.exe"

[Setup]
AppId={{9F8B4176-82E5-4D1B-A680-3D95E0C71124}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\DeadlineWidget
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=release
OutputBaseFilename=DeadlineWidget-Setup-{#MyAppVersion}
SetupIconFile=assets\app-icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut (Tao bieu tuong ngoai Desktop)"; GroupDescription: "Additional shortcuts:"
Name: "startup"; Description: "Start automatically with &Windows (Tu khoi dong cung Windows)"; GroupDescription: "Startup options:"

[Files]
Source: "release\DeadlineWidget-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "DeadlineWidget"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} now"; Flags: nowait postinstall skipifsilent
