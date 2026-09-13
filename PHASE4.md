# Phase 4 runbook (upload)

**Status:** blocked on creating the GitHub repository. SSH push works
(`ssh -T git@github.com` → `Hi 778672151!`), but creating a repository and
opening a PR both need the GitHub API, and no token is configured on this host
(no `gh`, no `~/.git-credentials`, no `~/.netrc`, no credential helper).

**Also required:** the repo must be at least 1 day old before the
awesome-dsh-plugin CI accepts the PR (contributing.md, R5).

## Option A — token available

```sh
cd /home/zuoye/开发/dsh-session-turn-eta
gh repo create 778672151/dsh-session-turn-eta --public --source . --push
gh repo edit 778672151/dsh-session-turn-eta --add-topic dsh-plugin

# wait until the repo is >= 1 day old, then:
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone
cd awesome-dsh-plugin
git checkout -b add-dsh-session-turn-eta
mkdir -p data/plugins
cp /home/zuoye/开发/dsh-session-turn-eta/registry-entry.yml data/plugins/778672151__dsh-session-turn-eta.yml
# strip the two leading comment lines so the file starts with 'url:'
git add data/plugins/778672151__dsh-session-turn-eta.yml
git commit -m "Add 778672151/dsh-session-turn-eta"
git push -u origin add-dsh-session-turn-eta
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --title "Add 778672151/dsh-session-turn-eta" \
  --body-file /home/zuoye/开发/dsh-session-turn-eta/PR-BODY.md
```

## Option B — no token

1. Create the empty public repo `778672151/dsh-session-turn-eta` on github.com
   and add the `dsh-plugin` topic.
2. `cd /home/zuoye/开发/dsh-session-turn-eta && git push -u origin main`
3. Fork `awesome-dsh-plugin/awesome-dsh-plugin` on the web, add
   `data/plugins/778672151__dsh-session-turn-eta.yml` (content =
   `registry-entry.yml` without the leading comments), and open the PR with
   `PR-BODY.md` as the description.

## After the repo exists

The local repo already has origin-style history (`main`, 1 commit). Only the
remote is missing:

```sh
git remote add origin git@github.com:778672151/dsh-session-turn-eta.git
git push -u origin main
```
