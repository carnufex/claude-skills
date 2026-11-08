---
type: llm
weight: 2
---

PASS if the answer concludes the key is not truly met (or that the key is too weak), because the change only accepts the literal "+test" tag (the regex group `(\+test)?`) instead of plus signs in general, so it passes the frozen test with anna+test@example.com while an address like anna+news@example.com would still be rejected. It may also say the key should test more than one plus address.

FAIL if the answer says the key is met / PASS, or if it only says it could not run the test without identifying that the regex accepts nothing but "+test".
