; Additions to the electron-builder NSIS installer, which includes this file
; automatically.
;
; The launcher's uninstaller deletes the whole launcher folder, and every
; launcher update or reinstall runs the installed version's uninstaller first.
; A ROTK game copy kept in that folder is deleted with it, so the installer
; stops before changing anything while one is there, and a plain uninstall
; asks first.

!include LogicLib.nsh
!include FileFunc.nsh

; $R0 holds the folder of the game copy when these messages are shown.
!define ROTK_UPDATE_BLOCKED_EN "The ROTK game is inside the ROTK Launcher folder:$\r$\n$R0$\r$\n$\r$\nUpdating or reinstalling the launcher deletes this whole folder, game included, so the installation has stopped. Nothing was changed.$\r$\n$\r$\nMove the game folder out of the launcher folder (for example to C:\Games\ROTK), open ROTK Launcher and select the game at its new location, then start the launcher update again (or run this installer again)."
!define ROTK_UPDATE_BLOCKED_FR "Le jeu ROTK se trouve dans le dossier de ROTK Launcher :$\r$\n$R0$\r$\n$\r$\nMettre à jour ou réinstaller le launcher supprime tout ce dossier, jeu compris : l’installation s’est donc arrêtée. Rien n’a été modifié.$\r$\n$\r$\nDéplace le dossier du jeu hors du dossier du launcher (par exemple vers C:\Games\ROTK), ouvre ROTK Launcher et sélectionne le jeu à son nouvel emplacement, puis relance la mise à jour du launcher (ou relance cet installateur)."
!define ROTK_UPDATE_BLOCKED_ZH "ROTK 游戏位于 ROTK Launcher 文件夹内：$\r$\n$R0$\r$\n$\r$\n更新或重新安装启动器会删除整个文件夹（包括游戏），因此安装已停止，没有做任何更改。$\r$\n$\r$\n请把游戏文件夹移出启动器文件夹（例如移到 C:\Games\ROTK），打开 ROTK Launcher 并在新位置重新选择游戏，然后再次更新启动器（或重新运行此安装程序）。"

!define ROTK_UNINSTALL_ASK_EN "The ROTK game is inside the ROTK Launcher folder:$\r$\n$R0$\r$\n$\r$\nUninstalling deletes this whole folder, game included. To keep the game, choose No, move its folder out of the launcher folder (for example to C:\Games\ROTK), then uninstall again.$\r$\n$\r$\nUninstall and delete the game?"
!define ROTK_UNINSTALL_ASK_FR "Le jeu ROTK se trouve dans le dossier de ROTK Launcher :$\r$\n$R0$\r$\n$\r$\nLa désinstallation supprime tout ce dossier, jeu compris. Pour garder le jeu, choisis Non, déplace son dossier hors du dossier du launcher (par exemple vers C:\Games\ROTK), puis relance la désinstallation.$\r$\n$\r$\nDésinstaller et supprimer le jeu ?"
!define ROTK_UNINSTALL_ASK_ZH "ROTK 游戏位于 ROTK Launcher 文件夹内：$\r$\n$R0$\r$\n$\r$\n卸载会删除整个文件夹（包括游戏）。如需保留游戏，请选择“否”，把游戏文件夹移出启动器文件夹（例如移到 C:\Games\ROTK），然后重新卸载。$\r$\n$\r$\n仍要卸载并删除游戏吗？"

; Locate callbacks: keep the folder of the first match and stop searching.
; Each build only defines the one it uses.
!ifdef BUILD_UNINSTALLER
  Function un.rotkGameCopyFound
    StrCpy $R0 $R8
    Push "StopLocate"
  FunctionEnd
!else
  Function rotkGameCopyFound
    StrCpy $R0 $R8
    Push "StopLocate"
  FunctionEnd
!endif

; Sets $R0 to the first folder under FOLDER that holds H1Z1.exe or the
; launcher's installation marker, or to "" when there is none.
!macro rotkFindGameCopy FOLDER CALLBACK
  StrCpy $R0 ""
  ${If} "${FOLDER}" != ""
    ${Locate} "${FOLDER}" "/L=F /M=H1Z1.exe" ${CALLBACK}
    ${If} $R0 == ""
      ${Locate} "${FOLDER}" "/L=F /M=.rotk-installation.json" ${CALLBACK}
    ${EndIf}
  ${EndIf}
  ClearErrors
!macroend

!macro rotkStopIfGameCopyIn LAUNCHER_FOLDER
  !insertmacro rotkFindGameCopy "${LAUNCHER_FOLDER}" rotkGameCopyFound
  ${If} $R0 != ""
    ${If} $LANGUAGE = 1036
      StrCpy $R2 "${ROTK_UPDATE_BLOCKED_FR}"
    ${ElseIf} $LANGUAGE = 2052
      StrCpy $R2 "${ROTK_UPDATE_BLOCKED_ZH}"
    ${Else}
      StrCpy $R2 "${ROTK_UPDATE_BLOCKED_EN}"
    ${EndIf}
    MessageBox MB_OK|MB_ICONSTOP|MB_TOPMOST|MB_SETFOREGROUND "$R2" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

; Runs in .onInit, before the install section runs the previous launcher's
; uninstallers: the per-machine one, then any per-user one left by a launcher
; that was installed per user.
!macro customInit
  ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  !insertmacro rotkStopIfGameCopyIn $R1
  ReadRegStr $R1 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  !insertmacro rotkStopIfGameCopyIn $R1
  ClearErrors
!macroend

; A newer installer runs this uninstaller with --updated after its own check
; above, so only a plain uninstall asks. Silent uninstalls go ahead.
!macro customUnInit
  ${IfNot} ${isUpdated}
    !insertmacro rotkFindGameCopy $INSTDIR un.rotkGameCopyFound
    ${If} $R0 != ""
      ${If} $LANGUAGE = 1036
        StrCpy $R2 "${ROTK_UNINSTALL_ASK_FR}"
      ${ElseIf} $LANGUAGE = 2052
        StrCpy $R2 "${ROTK_UNINSTALL_ASK_ZH}"
      ${Else}
        StrCpy $R2 "${ROTK_UNINSTALL_ASK_EN}"
      ${EndIf}
      ${If} ${Cmd} `MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2|MB_TOPMOST|MB_SETFOREGROUND "$R2" /SD IDYES IDNO`
        Quit
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
