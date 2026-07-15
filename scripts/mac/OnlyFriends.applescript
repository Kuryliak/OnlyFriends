on run
	try
		set appPosix to POSIX path of (path to me)
		-- убрать завершающий слэш
		if appPosix ends with "/" then
			set appPosix to text 1 thru -2 of appPosix
		end if
		set projectRoot to do shell script "dirname " & quoted form of appPosix
		set launcher to projectRoot & "/scripts/mac/launch.sh"
		
		set launcherExists to do shell script "test -f " & quoted form of launcher & " && echo yes || echo no"
		if launcherExists is not "yes" then
			display dialog "Не найден scripts/mac/launch.sh." & return & return & "Положите OnlyFriends.app внутрь папки проекта OnlyFriends (рядом с package.json)." buttons {"OK"} default button 1 with title "OnlyFriends" with icon stop
			return
		end if
		
		-- права после распаковки zip
		do shell script "chmod +x " & quoted form of launcher & " " & quoted form of (projectRoot & "/Запустить OnlyFriends.command") & " " & quoted form of (projectRoot & "/Остановить OnlyFriends.command") & " 2>/dev/null || true"
		
		tell application "Terminal"
			activate
			do script "cd " & quoted form of projectRoot & " && bash " & quoted form of launcher
		end tell
	on error errMsg number errNum
		display dialog "Ошибка запуска OnlyFriends:" & return & return & errMsg buttons {"OK"} default button 1 with title "OnlyFriends" with icon stop
	end try
end run
