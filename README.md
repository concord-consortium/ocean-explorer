# Ocean Explorer

## Development

### Initial steps

1. Clone this repo and `cd` into it
2. Run `npm install` to pull dependencies
3. Run `npm start` to run `webpack-dev-server` in development mode with hot module replacement

#### Run using HTTPS

Additional steps are required to run using HTTPS.

1. install [mkcert](https://github.com/FiloSottile/mkcert) : `brew install mkcert` (install using Scoop or Chocolatey on Windows)
2. Create and install the trusted CA in keychain if it doesn't already exist:   `mkcert -install`
3. Ensure you have a `.localhost-ssl` certificate directory in your home directory (create if needed, typically `C:\Users\UserName` on Windows) and cd into that directory
4. Make the cert files: `mkcert -cert-file localhost.pem -key-file localhost.key localhost 127.0.0.1 ::1`
5. Run `npm run start:secure` to run `webpack-dev-server` in development mode with hot module replacement

Alternately, you can run secure without certificates in Chrome:
1. Enter `chrome://flags/#allow-insecure-localhost` in Chrome URL bar
2. Change flag from disabled to enabled
3. Run `npm run start:secure:no-certs` to run `webpack-dev-server` in development mode with hot module replacement

### Building

If you want to build a local version run `npm build`, it will create the files in the `dist` folder.
You *do not* need to build to deploy the code, that is automatic.  See more info in the Deployment section below.

### Notes

1. Make sure if you are using Visual Studio Code that you use the workspace version of TypeScript.
   To ensure that you are open a TypeScript file in VSC and then click on the version number next to
   `TypeScript React` in the status bar and select 'Use Workspace Version' in the popup menu.

## Deployment

Follow the instructions in this
[Guide](https://docs.google.com/document/d/1EacCSUhaHXaL8ll8xjcd4svyguEO-ipf5aF980-_q8E)
to setup an S3 & Cloudfront distribution that can be used with GitHub actions.
See also `s3_deploy.sh`, and `./github/ci.yml`.

Production releases to S3 are based on the contents of the /dist folder and are built automatically by GitHub Actions
for each branch and tag pushed to GitHub.

Branches are deployed to http://ocean-explorer.concord.org/branch/<name>.
If the branch name starts or ends with a number this number is stripped off.

Tags are deployed to http://ocean-explorer.concord.org/version/<name>.

To deploy a production release:

1. Increment version number in package.json
2. Create new entry in CHANGELOG.md
3. Run `git log --pretty=oneline --reverse <last release tag>...HEAD | grep '#' | grep -v Merge` and add contents (after edits if needed to CHANGELOG.md)
4. Run `npm run build`
5. Copy asset size markdown table from previous release and change sizes to match new sizes in `dist`
6. Create `release-<version>` branch and commit changes, push to GitHub, create PR and merge
7. Checkout main and pull
8. Create an annotated tag for the version, of the form `v[x].[y].[z]`, include at least the version in the tag message. On the command line this can be done with a command like `git tag -a v1.2.3 -m "1.2.3 some info about this version"`
9. Push the tag to GitHub with a command like: `git push origin v1.2.3`.
10. Use https://github.com/concord-consortium/ocean-explorer/releases to make this tag into a GitHub release.
11. Run the release workflow to update http://ocean-explorer.concord.org/index.html. 
    1. Navigate to the actions page in GitHub and the click the "Release" workflow. This should take you to this page: https://github.com/concord-consortium/ocean-explorer/actions/workflows/release.yml. 
    2. Click the "Run workflow" menu button. 
    3. Type in the tag name you want to release for example `v1.2.3`.  (Note this won't work until the PR has been merged to main)
    4. Click the `Run Workflow` button.

### Testing

Run `npm test` to run Jest unit tests. Run `npm run test:full` to run both Jest and Playwright tests.

##### Playwright E2E Tests

E2E tests use [Playwright](https://playwright.dev/) and live in the `playwright/` directory.

To run them locally:

1. Start the dev server: `npm start`
2. Run the tests: `npm run test:playwright`
3. Or open the interactive UI: `npm run test:playwright:open`

The dev server advertises itself via [Bonjour/mDNS](https://en.wikipedia.org/wiki/Zero-configuration_networking) (configured in `webpack.config.js`). When Playwright tests run locally, a custom test fixture (`playwright/lib/base-url.ts`) discovers the dev server's port automatically via Bonjour — so tests work regardless of which port the dev server happens to be on.

On CI, the Playwright config starts the dev server on a fixed port (8080) and skips Bonjour discovery.

If you need to debug Bonjour service discovery, run `npm run discover-services` to list all HTTP services being advertised on your local network.

## License

Ocean Explorer is Copyright 2025 (c) by the Concord Consortium and is distributed under the [MIT license](http://www.opensource.org/licenses/MIT).

See license.md for the complete license text.
