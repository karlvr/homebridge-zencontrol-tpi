# Zencontrol Third Party Interface Homebridge plugin

A plugin for Homebridge that enables control over lights using Zencontrol Third Party Interface (TPI).

## Features

### Groups

DALI Groups will be represented as light switches.

### Individual lights

Any light ECGs that aren't part of a group will be represented as a light switch.

### Blinds

Any blind controller that has its name (Location name) listed in the Blinds list in the plugin configuration will be represented
as a window covering.

If a system variable exists with the same name as the blind but with the word "Position" after it, then it will be used to reflect
the position of the blind (0 = closed, 100 = open). This is because the blind controller arc level may not accurately reflect the
blind position if it resets to 0 after some time.

### Relays

Any relay that has its name (Location name) listed in the Switches list in the plugin configuration will be represented as a switch. Only named relays
are handled to prevent pulling through relays that aren't appropriate.

### Temperature

System variables that end with the word "Temperature" will be represented as temperature sensor accessories.

### Humidity

System variables that end with the word "Humidity" will be represented as humidity sensor accessories.

### Lux

System variables that end with the word "Lux" will be represented as light sensor accessories.

### CO2

System variables that end with the word "CO2" will be represented as carbon dioxide sensor accessories.

Set the CO2 level to treat as abnormal in the plugin configuration.

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
