// DO Spaces client for the database backups. Runs inside the `api`
// container, which already has @aws-sdk/client-s3 and the DO_SPACES_* env:
//
//   docker compose exec -T api node -e "$(cat deploy/spaces-backup.cjs)" <cmd> …
//
//   put <key> <sha256>  upload stdin as a PRIVATE object, then confirm its size
//   get <key>           write the object to stdout
//   list <prefix>       print "<key> <bytes>" newest first
//   prune <prefix> <n>  delete all but the newest <n> objects under <prefix>
//
// Keys carry a UTC timestamp, so name order is age order.
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');

const env = process.env;
const bucket = env.DO_SPACES_BUCKET;
// Same rule as spacesEndpoints() in the API: the SDK adds the bucket to the
// host itself, so a Space-origin endpoint must lose its bucket label.
const url = new URL(env.DO_SPACES_ENDPOINT);
const host = url.hostname.startsWith(`${bucket}.`)
  ? url.hostname.slice(bucket.length + 1)
  : url.hostname;
const s3 = new S3Client({
  endpoint: `${url.protocol}//${host}`,
  region: env.DO_SPACES_REGION,
  credentials: {
    accessKeyId: env.DO_SPACES_KEY,
    secretAccessKey: env.DO_SPACES_SECRET,
  },
});

async function list(prefix) {
  const out = [];
  let token;
  do {
    const r = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    out.push(...(r.Contents ?? []));
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => (a.Key < b.Key ? 1 : -1));
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks);
}

const [cmd, a, b] = process.argv.slice(1);
const commands = {
  async put() {
    const body = await readStdin();
    if (body.length === 0) throw new Error('empty input');
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: a,
        Body: body,
        ACL: 'private',
        ContentType: 'application/octet-stream',
        Metadata: { sha256: b ?? '' },
      }),
    );
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: a }));
    if (head.ContentLength !== body.length) {
      throw new Error(`size mismatch: sent ${body.length}, stored ${head.ContentLength}`);
    }
    console.log(`uploaded ${a} ${body.length}`);
  },
  async get() {
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: a }));
    for await (const c of r.Body) process.stdout.write(c);
  },
  async list() {
    for (const o of await list(a)) console.log(`${o.Key} ${o.Size}`);
  },
  async prune() {
    const keep = Number(b);
    if (!a || !Number.isInteger(keep) || keep < 1) throw new Error('prune <prefix> <n>=1+');
    const old = (await list(a)).slice(keep);
    if (old.length) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: old.map((o) => ({ Key: o.Key })) },
        }),
      );
    }
    console.log(`pruned ${old.length} under ${a}`);
  },
};

if (!commands[cmd]) {
  console.error('usage: put <key> <sha256> | get <key> | list <prefix> | prune <prefix> <n>');
  process.exit(2);
}
commands[cmd]().catch((err) => {
  console.error(`spaces-backup ${cmd} failed: ${err.name}: ${err.message}`);
  process.exit(1);
});
