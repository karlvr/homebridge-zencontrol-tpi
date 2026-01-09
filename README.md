# Zencontrol Third Party Interface Homebridge plugin

A plugin for Homebridge that enables control over lights using Zencontrol Third Party Interface (TPI).

## Development

```shell
nvm install
nvm use
npm install
npm run build
```

When I make changes I like to test them on my local Homebridge, which is on another device accessible via ssh:

```shell
npm run build && rsync -a dist ubuntu@192.168.1.2:/var/lib/homebridge/node_modules/homebridge-zencontrol-tpi/
```

Then I restart Homebridge to load the updated code.

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
