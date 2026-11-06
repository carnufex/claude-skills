# gitops

- **gitops-app-onboarding**: add a new application to a cluster where an ArgoCD ApplicationSet turns each folder into its own
  application and namespace. The safe order (namespace → secrets → workload → 3 am alert → route last), every namespace
  whitelist in the same commit, image, secret and storage conventions, when to expose publicly, and how to verify the app
  converged instead of assuming it did.

## Install

```text
/plugin marketplace add carnufex/claude-skills
/plugin install gitops@carnufex
```

## Profile

`.claude/profiles/gitops.md` in the GitOps repository, from `skills/gitops-app-onboarding/templates/profile.md`: *Layout*,
*Whitelists*, *Namespace*, *Images*, *Secrets*, *Storage*, *Routing*, *Reference apps*, *Monitoring*, *Verify* and
*Related skills*. The skill creates it on first use if it is missing.
