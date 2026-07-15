#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <libgen.h>
#include <sys/stat.h>
#include <mach-o/dyld.h>

static void die_dialog(const char *msg) {
  char cmd[4096];
  /* escape for osascript double-quoted string: keep it simple */
  snprintf(cmd, sizeof(cmd),
    "osascript -e 'display dialog \"%s\" buttons {\"OK\"} default button 1 "
    "with title \"OnlyFriends\" with icon stop' >/dev/null 2>&1",
    msg);
  system(cmd);
  exit(1);
}

int main(void) {
  char exe[PATH_MAX];
  uint32_t size = sizeof(exe);
  if (_NSGetExecutablePath(exe, &size) != 0) {
    die_dialog("Не удалось определить путь к приложению.");
  }

  char resolved[PATH_MAX];
  if (!realpath(exe, resolved)) {
    strncpy(resolved, exe, sizeof(resolved) - 1);
    resolved[sizeof(resolved) - 1] = '\0';
  }

  /* .../OnlyFriends.app/Contents/MacOS/<bin>  → project root = ../../.. */
  char tmp[PATH_MAX];
  strncpy(tmp, resolved, sizeof(tmp) - 1);
  tmp[sizeof(tmp) - 1] = '\0';

  char *macos = dirname(tmp);
  char tmp2[PATH_MAX];
  strncpy(tmp2, macos, sizeof(tmp2) - 1);
  char *contents = dirname(tmp2);
  char tmp3[PATH_MAX];
  strncpy(tmp3, contents, sizeof(tmp3) - 1);
  char *app = dirname(tmp3);
  char tmp4[PATH_MAX];
  strncpy(tmp4, app, sizeof(tmp4) - 1);
  char *root = dirname(tmp4);

  char launcher[PATH_MAX];
  snprintf(launcher, sizeof(launcher), "%s/scripts/mac/launch.sh", root);

  struct stat st;
  if (stat(launcher, &st) != 0) {
    die_dialog("Не найден scripts/mac/launch.sh. Положите OnlyFriends.app внутри папки проекта.");
  }

  /* fix +x after zip */
  char chmod_cmd[PATH_MAX * 2];
  snprintf(chmod_cmd, sizeof(chmod_cmd),
    "chmod +x %s \"%s/Запустить OnlyFriends.command\" \"%s/Остановить OnlyFriends.command\" 2>/dev/null; "
    "xattr -cr \"%s/OnlyFriends.app\" 2>/dev/null; true",
    launcher, root, root, root);
  /* launcher path may need quotes */
  snprintf(chmod_cmd, sizeof(chmod_cmd),
    "chmod +x \"%s\" 2>/dev/null; xattr -cr \"%s/OnlyFriends.app\" 2>/dev/null; true",
    launcher, root);
  system(chmod_cmd);

  /* Open Terminal with launch script — quote carefully for AppleScript */
  char as[PATH_MAX * 4];
  snprintf(as, sizeof(as),
    "osascript -e 'tell application \"Terminal\"' "
    "-e 'activate' "
    "-e 'do script \"cd \\\"%s\\\" && bash \\\"%s\\\"\"' "
    "-e 'end tell'",
    root, launcher);

  int rc = system(as);
  if (rc != 0) {
    /* fallback: run in background without Terminal window */
    char bg[PATH_MAX * 2];
    snprintf(bg, sizeof(bg), "cd \"%s\" && bash \"%s\" &", root, launcher);
    system(bg);
  }
  return 0;
}
