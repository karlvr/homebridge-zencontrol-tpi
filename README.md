# Zencontrol Third Party Interface Homebridge plugin

A plugin for Homebridge that enables control over lights using Zencontrol Third Party Interface (TPI).

## Testing

## Releasing

### Pre-release

To enter pre-release mode:

```shell
pnpm changeset pre enter next
git add .changeset/pre.json
git commit -m "publish: enter prerelease"
```

Once you've made changes and committed one or more changesets; bump the version:

```shell
pnpm changeset version
git commit -m "publish"
pnpm changeset publish
```
