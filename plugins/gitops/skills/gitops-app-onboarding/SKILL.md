---
name: gitops-app-onboarding
description: Add a new application to a GitOps-managed Kubernetes cluster (ArgoCD ApplicationSet with one directory per app, External Secrets, Gateway API routes, optional LoadBalancer IPs). Use when scaffolding or onboarding a new app or service that becomes its own ArgoCD application and namespace, or when a newly added app will not sync or its secrets never appear. Covers the safe onboarding order, every whitelist a new namespace needs, image, secret and storage conventions, the alert that tells on-call it is down, and when it is safe to expose publicly.
---

# GitOps app onboarding

The method is generic; the cluster's facts (paths, whitelists, registry, storage classes, gateways, reference apps, where
alerts live) are in `.claude/profiles/gitops.md` in the GitOps repository. **Read the profile first.** If it is missing,
create it from `templates/profile.md` by reading the repository (the ApplicationSet, the AppProject, the secret store, an
existing app or two, the monitoring folder) and tell the user in one line that you wrote it. Never guess a path.

## How an app becomes live

- An ApplicationSet with a directory generator turns each folder under the profile's *apps directory* into its **own ArgoCD
  application and namespace**. A folder deploys once it has a valid `kustomization.yaml`.
- Nothing reaches the cluster until it is **pushed** to the branch ArgoCD tracks. A change applied only with `kubectl` is
  reverted at the next sync.
- Platform components (CNI, storage, controllers) do not go in the apps directory; the profile says where they live.

## A new namespace must be whitelisted everywhere, in the same commit

The profile's *Whitelists* section lists every file that names namespaces (typically: the AppProject `destinations`, the
ClusterSecretStore `conditions`, and the LoadBalancer IP pool and L2/BGP announcement selectors if the app needs an LB IP).
Miss one and the app fails to sync, its `ExternalSecret`s stay `SecretSyncError`, or its LB IP never gets announced. Add the
namespace to every applicable file in the commit that adds the folder.

## Onboarding order (smallest safe shape first)

1. `ns.yaml`: the namespace with the profile's pod-security labels.
2. `kustomization.yaml`: resources in dependency order (namespace and config, then workloads, then routes).
3. Secrets: create the entries in the secret backend first (profile: *Secrets*), then an `ExternalSecret` per secret. Never
   commit secret values; bootstrap and break-glass secrets stay out of Git.
4. Runtime manifests (Deployment, Service, PVCs, ConfigMap), **only after** the image names and secret names are confirmed.
   Readiness and liveness probes on a real health endpoint, resource requests, and the security context the namespace's
   pod-security level requires.
5. **The 3 am signal** (below), in the same change as the workload.
6. The route, **last**, once the image runs, secrets resolve and the probes pass (see *Exposure*).
7. A `README.md` in the app folder: what it is, its runtime dependencies, its secret names, its storage, how it is reached.

## Conventions (the profile has the values)

- **Images**: pin `tag@sha256:<digest>` unless the profile says the app tracks a moving tag; own images come from the
  profile's registry with immutable tags. Private images need the profile's pull-secret pattern.
- **Secrets**: `ExternalSecret` resources against the profile's ClusterSecretStore, never inline `Secret` data.
- **Storage**: the profile's storage classes and what each is for (small replicated block volumes vs bulk data on NFS).
  Capacity limits in the profile are hard limits.
- **Routing**: public and internal gateways and their host patterns; raw TCP/UDP through a LoadBalancer Service.
- Copy the shape of the profile's *Reference apps* rather than inventing a new one.

## The 3 am signal

Ask before you push: *if this app broke at 3 am, how would anyone know, and what would they look at first?*

- The app must be covered by an alert that reaches a person: add its namespace and workload to the profile's *Monitoring*
  alert rules (unavailable replicas, crash loops, pending pods or PVCs), or add an app-specific rule if it has a failure mode
  those cannot see (a queue that stops draining, a job that stops running, an expiring certificate or token).
- The app's logs must say what failed with the ids that localise it; if the image is ours and they do not, that is a task.
- Write the signal in the commit message: `3 am: <alert name> via <receiver>`.

## Exposure

Do not add a public route until the app runs, its secrets resolve and its health checks pass. Internal-only tools attach only
to the internal gateway and get no public route. When you do expose publicly, follow the profile's *Related skills* for the
public ingress path (DNS, tunnel, certificates).

## After onboarding (verify, do not assume)

1. Push; watch the new application appear and converge (`kubectl get applications.argoproj.io -n argocd`, or the profile's
   *Verify* commands). Request a refresh to skip the poll delay if the profile shows how.
2. Check: application `Synced` and `Healthy`, every `ExternalSecret` `SecretSynced`, pods ready, the route answers, and the
   alert rule is loaded (it appears in the rule list of the monitoring stack).
3. If it does not converge, walk the chain top-down: whitelists → secrets → ArgoCD sync errors → pods → routing. The
   whitelists are the usual culprit. The profile's *Related skills* names the cluster's diagnostics skill.
