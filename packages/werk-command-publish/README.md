# Werk Run Command

Publish workspaces.

**Note:** Only unpublished versions of public workspaces are published!

[![npm](https://img.shields.io/npm/v/@werk/command-publish?label=NPM)](https://www.npmjs.com/package/@werk/command-publish)
[![werk](https://img.shields.io/npm/v/@werk/cli?label=Werk&color=purple)](https://www.npmjs.com/package/@werk/cli)

## Install

```sh
npm i -D @werk/command-publish
```

## Publish Workspaces

The state of the monorepo is [validated](#validation) before publishing. Publishing workspaces with local dependencies is always dependent on the local dependency workspaces also being published successfully, even if the Werk `--no-wait` option is set.

The workspaces root `build` script is run before publishing, if it is present.

```sh
werk publish
```

The packages to be published can be limited using [Werk global options](https://www.npmjs.com/package/@werk/cli#command-line-options). Selected workspaces will still be checked for publishability, and may be skipped if they are not publishable.

```sh
werk -w my-workspace publish
```

To pack packages instead of publishing them immediately, set the `--to-archive` option.

```sh
werk publish --to-archive
```

The resulting archives can be published later by setting the `--from-archive` option. This will skip most validation, only checking for the existence of archives with a name and version matching the adjacent `package.json` file.

```sh
werk publish --from-archive
```

## Multi-Factor Authentication

Use the `--otp` option to set a one-time password for publishing.

```sh
werk publish --otp=123456
```

## Remove Package Fields

Use the `--remove-package-fields` option to remove fields from the `package.json` file before publishing. This is useful for removing fields that are only used for local development, such as `devDependencies` and `scripts`.

```sh
werk publish --remove-package-fields devDependencies scripts
```

The fields can be dot notated to remove nested fields.

```sh
werk publish --remove-package-fields scripts.test
```

## Publish Tag

Use the `--tag` option to set the tag for the published package. The default tag is `latest`.

```sh
werk publish --tag=next
```

## Dry run

Use the `--dry-run` option to validate without making any permanent changes on disk (temporary only) or pushing to the registry. The `--dry-run` option will be passed through to the `npm publish` or `npm pack` command.

```sh
werk publish --dry-run
```

## Validation

Validation is always performed before publishing. This provides reasonable certainty that published packages will have resolvable dependencies based on the expected source code.

1. **Ensure the Git working tree is clean.**

   - If there are uncommitted changes, then there may not be any permanent record of the published code. Publishing also makes temporary changes to `package.json` files, which need to be removed be resetting the uncommitted changes.

2. **Ensure local dependencies are either successfully published, or were already published from up-to-date code.**

   - If there are local modifications that are not already published or going to be published (no version change or filtered out), then local building and testing may not reflect the published behavior of a package.

3. **Ensure package.json entry points exist and will be included in the published package.**

   - If the entry points do not exist or are not included in the published package, then the package may not be usable.

## Temporary `package.json` changes

The following changes are made before publishing, and will be rolled back after publishing finishes (successfully or not). Change are only made in publishable workspaces.

- Record the current commit hash under the `gitHead` key.
  - NPM should already do this for publishing. However, it is not done when packing. The field is also poorly documented even though it was added in v7, so it's possible that it might not be added in the future.
- Update all local workspace dependency versions.
  - Replace any `file:` or `*` "versions" with real versions.
  - Update any version ranges so that the minimum version is the current version.
