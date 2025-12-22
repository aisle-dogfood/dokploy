```
npm install
npm run dev
```

```
open http://localhost:3000
```

## Environment Variables

- `ALLOW_QUEUE_OBLITERATE` (optional): Set to `"true"` to enable queue obliteration on startup. This will remove all scheduled jobs and pending tasks from the Redis queue. **Warning**: Only use in development/testing environments to prevent data loss in production.
