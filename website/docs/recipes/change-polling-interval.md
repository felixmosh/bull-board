# Polling interval

The dashboard polls `GET /api/queues` to refresh. Default is 5 seconds. Two knobs in UIConfig.

## Let users pick

```ts
serverAdapter.setUIConfig({
  pollingInterval: { showSetting: true },
});
```

Adds a picker in the settings modal. The browser persists the user's choice in localStorage.

## Force a specific interval and hide the picker

```ts
serverAdapter.setUIConfig({
  pollingInterval: { forceInterval: 2000 }, // ms
});
```

Good for busy dashboards where you want to guarantee a floor, or slow ones where you want to cap load.

Don't go below 1 second. You'll hammer Redis without gaining anything visible.
