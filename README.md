# Zencontrol Third Party Interface Homebridge plugin

A plugin for Homebridge that enables control over lights using Zencontrol Third Party Interface (TPI).

## Testing

## Contributing

This project uses `npm` and [`changesets`](https://github.com/changesets/changesets) for its build process.

When committing a change, please create a changeset:

```shell
npm exec changeset
git commit -a "feat: ..."
```

## Releasing

### Pre-release

To enter pre-release mode:

```shell
npm exec changeset pre enter next
git add .changeset/pre.json
git commit -m "publish: enter prerelease"
```

Once you've made changes and committed one or more changesets; bump the version:

```shell
npm run release:version
git commit -a -m "publish: prerelease"
npm run release
```

To exit pre-release mode:

```shell
npm exec changeset pre exit
npm run release:version
git commit -a -m "publish: release"
npm run release
```
