# gcf-cors-anywhere

An alternative to [Rob--W/cors-anywhere](https://github.com/Rob--W/cors-anywhere).

gcf-cors-anywhere is a Node.js proxy which adds CORS headers to the proxied request running on Google Cloud Functions.

The url to proxy is taken from the search params `?u=`, validated and proxied.

## Deploy to your GCP project

[Tutorial](https://cloud.google.com/functions/docs/quickstart)

1. In the Google Cloud Console, on the project selector page, select or create a Google Cloud project.
2. Make sure that billing is enabled for your Cloud project. [Learn how to confirm that billing is enabled for your project.](https://cloud.google.com/billing/docs/how-to/modify-project)
3. Enable the Cloud Functions and Cloud Build APIs.
4. [Install and initialize the Cloud SDK.](https://cloud.google.com/sdk/docs?hl=zh-tw)
5. Update gcloud components:
    ```bash
    gcloud components update
    gcloud init
    ```
6. Deploy this function. YOU NEED TO CHANGE `PROJECT_ID` AND `GCP_REGION`.
    ```bash
    wget https://github.com/taichunmin/gcf-cors-anywhere/archive/master.zip -O gcf-cors-anywhere.zip
    unzip gcf-cors-anywhere.zip
    # YOU NEED TO CHANGE `PROJECT_ID` AND `GCP_REGION`.
    gcloud functions deploy cors-anywhere --allow-unauthenticated --entry-point=main --max-instances=1 --memory=128MB --project=PROJECT_ID --region=GCP_REGION --runtime=nodejs12 --source ./gcf-cors-anywhere-master --timeout=60s --trigger-http
    # clean up
    # rm -rf ./gcf-cors-anywhere.zip ./gcf-cors-anywhere-master
    ```

## Usage

Use Axios and LINE Login API as example:

### GET

```js
// YOU NEED TO CHANGE `PROJECT_ID` AND `GCP_REGION`.
const result = await axios.get('https://GCP_REGION-PROJECT_ID.cloudfunctions.net/cors-anywhere', {
  params: {
    u: 'https://api.line.me/v2/profile', // your real url
    // you can add additional params here
  },
  headers: { Authorization: 'Bearer ACCESS_TOKEN' },
})
console.log(result.data)
```

### POST

```js
// YOU NEED TO CHANGE `PROJECT_ID` AND `GCP_REGION`.
const result = await axios.post('https://GCP_REGION-PROJECT_ID.cloudfunctions.net/cors-anywhere', Qs.stringify({
  client_id: 'CLIENT_ID',
  id_token: 'ID_TOKEN',
  nonce: 'NONCE',
  user_id: 'USER_ID',
}), {
  params: { u: 'https://api.line.me/oauth2/v2.1/verify' }, // your real url
})
console.log(result.data)
```