# GitOps profile

<!--
Read by the gitops-app-onboarding skill (plugin `gitops@carnufex`). Facts about THIS cluster repository only;
the skill holds the method. Every path is relative to the repository root.
-->

## Layout

- Apps directory: `<kubernetes/applications/>` — one folder per app, picked up by `<path to ApplicationSet>`
- Tracked branch: `<main>`
- Platform components (not apps): `<kubernetes/infrastructure/>`

## Whitelists

<!-- Every file that lists namespaces. The skill adds the new namespace to each applicable one in the same commit. -->
1. `<AppProject file>` — `spec.destinations`
2. `<ClusterSecretStore file>` — `spec.conditions` (otherwise every ExternalSecret stays SecretSyncError)
3. Only for a LoadBalancer IP: `<ip-pool file>` and `<announce file>` selectors

## Namespace

- Pod-security labels: `<copy from kubernetes/applications/<app>/ns.yaml>`

## Images

- Registry: `<registry/org>`; tags `<sha-<gitshort>>`; pin `tag@sha256:<digest>`
- Who bumps pins: `<Renovate / CI / by hand>`
- Private images: `<pull-secret pattern and where to copy it from>`

## Secrets

- Backend and how to create an entry: `<e.g. Bitwarden Secrets Manager via bws>`
- ClusterSecretStore name: `<name>`

## Storage

| Class | Use for | Limits |
|---|---|---|
| `<class>` | `<small RWO config/DB>` | `<replicas, reclaim policy, capacity note>` |

## Routing

- Public: `<gateway/namespace>` on `<*.example.com>`
- Internal: `<gateway/namespace>` on `<*.example.local>`
- Raw TCP/UDP: `<LoadBalancer from pool X>`

## Reference apps

- `<app>` — `<what makes it a good model>`

## Monitoring

<!-- Where the 3 am signal goes. -->
- Generic app alerts: `<path to PrometheusRule>` — add the namespace and workload to the selectors
- Alerts reach a person through: `<Alertmanager receiver>`
- Logs: `<Loki/Grafana URL or query>`

## Verify

- `<kubectl get applications.argoproj.io -n argocd>`
- `<how to request a refresh>`

## Related skills

- Public ingress: `<skill name>`
- Diagnostics: `<skill name>`
