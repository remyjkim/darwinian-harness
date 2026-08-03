# Worker artifact snapshot fixtures

The positive fixture binds the frozen GTM `OrgWorkerBundleV1` to one explicit
packet root and one directory-backed Card tree.

`contentTreeDigest` hashes:

```text
UTF8("darwinian:worker-artifact-tree:v1\n")
  || canonicalJson(sortedRegularFileEntries)
```

Each entry is exactly:

```json
{"relativePath":"path/from/artifact/root","byteLength":0,"sha256":"sha256:<hex>"}
```

Entries sort by `relativePath`. Object keys use locale-independent lexical
ordering. Symlinks and non-regular content are outside the profile.

## Released boundary

`released-boundary.manifest.json` pins every byte used by the fresh-process
qualification scenario. The released bundle copy, artifact snapshot, content
tree, positive materialize/reconcile/remove receipt vectors, and bounded
negative receipt manifest all live below this fixture root. The scenario does
not import producer source code or resolve a sibling checkout.

The three positive receipts use fixed IDs and timestamps so their canonical
receipt digests are stable. The removed receipt chains to the reconcile fixture
through `priorReceiptDigest`. Runtime scenarios normalize only operation-local
IDs, timestamps, the project-path-dependent lock digest, and the corresponding
prior receipt digest before comparing emitted receipts to these vectors.
