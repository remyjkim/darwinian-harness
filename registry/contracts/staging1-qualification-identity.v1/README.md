# I321 staging-1 qualification identity v1

This language-neutral contract is the sole source for the hidden Worker staging-1 qualification identity tuple. It binds the Auth Hub origin, issuer, JWKS URL, API resource/origin, Web and approval origins, client, and exact ordered scopes to one environment. It is public configuration and never carries bearer, Human, organization, session, or grant data. Consumers must reject all cross-environment, multi-issuer, arbitrary-profile, and endpoint-override vectors. Public Worker profiles remain unchanged.
