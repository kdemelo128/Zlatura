# Changelog fragments

Each PR adds one file here, named after its branch (`claude/foo` becomes
`claude-foo.md`), and doesn't edit `CHANGELOG.md` itself:

```
# <what a broker gets, in plain words>

<the entry: the cause, bold-led bullets for what changed, how it was tested,
and whether saved results changed>
```

The PR's last commit runs `npm run bump -- x.y.z`. It sets the version in
the five places it's written, folds the fragment into `CHANGELOG.md` as
`## x.y.z: <title> (on the development branch; not merged or deployed)`,
and deletes the fragment. It changes nothing if there isn't exactly one
fragment, or if the fragment is malformed. `node tests/tools/changelog.mjs
--check` checks the fragments waiting. Design:
`docs/proposals/changelog-fragments.md`.
