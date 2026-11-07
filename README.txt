# LostLink LL-DIAG V1

## Files
- `diagnostics.html` — standalone internal dashboard
- `diagnostics.css` — dashboard styling
- `diagnostics.js` — logger, manual tests, selected-page checks, export
- `diagnostics-config.js` — optional configuration

## Install
1. Back up your current LostLink repository.
2. Copy the four runtime files into the same directory as the LostLink HTML pages. Keep this README with the installation if you want the setup and privacy notes available.
3. Rename `diagnostics.html` to a less guessable filename if you want an unlinked/obscure URL. A hidden filename is NOT access control.
4. Open the dashboard directly using its URL.
5. Paste your deployed Google Apps Script web-app URL ending in `/exec`, then choose **Save URL**.
6. Choose **Run all tests** and **Check page**. Tests are manual; no API tests run automatically.
7. To capture activity and JavaScript errors on existing LostLink pages, add the integration script tags below to each page.

## Required integration on existing pages
To capture early errors and monitor LostLink API calls, add these tags in the `<head>` of `index.html`, `latest.html`, `search.html`, `report.html`, `Feedback.html`, and any other page you want monitored. Put them before the page's existing application scripts and do not add them twice:

```html
<script src="diagnostics-config.js"></script>
<script src="diagnostics.js"></script>
```

The engine initializes immediately, registers browser error listeners, and waits for DOM readiness before attempting dashboard initialization. It does not call the API during page load. The dashboard's connection tests run only when you click **Run all tests**.

The diagnostic script is defensive and does not call the LostLink API during page load. It only observes fetch/XHR and browser errors. The dashboard's connection tests are started only by clicking **Run all tests**.

## API test behavior
The dashboard checks:
- `?action=latest&limit=1`
- `?action=search&q=LLDIAG`
- `?action=translate&target=en&text=diagnostic`

It expects JSON with `success: true`. The translation check requires the current API deployment to support the `translate` action.

## Local storage
Logs are stored under `lostlink_ll_diag_v1` in the current browser profile. The API URL is stored separately under `lostlink_ll_diag_v1_api`. Clearing browser site data may erase the logs. Logs are capped to the most recent 300 network events and 300 errors.

## Privacy / security
- No logs are sent to Google Sheets or any server.
- Query strings, URL fragments, and Google Apps Script deployment IDs are removed from recorded request destinations.
- Raw runtime, promise-rejection, and `console.error` messages are not saved; only a generic event label and source location are recorded.
- Passwords, form contents, and personal data are not read from requests or page fields. Review browser details and timing information before sharing exports.
- A hidden URL, `noindex`, and `nofollow` do not prevent someone who knows the URL from opening it. For real admin-only access, enforce authentication at the hosting/server layer.

## Important limits
- The browser cannot read the existing DevTools console history. LL-DIAG captures new runtime errors, unhandled promise rejections, failed resource loads, and `console.error` calls after it is loaded.
- Browser cross-origin rules may prevent some endpoints from being tested. A blocked request is reported as a failure, even if the remote service itself is online.
- A Google Apps Script `doGet` API does not expose a separate health endpoint here; tests use the existing public read/translate actions and do not modify the Apps Script project.
- Network monitoring sees requests made after the diagnostic script loads. It does not recover earlier requests.
