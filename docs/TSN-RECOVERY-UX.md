# TSN Recovery UX

Recovery components use payment-language, not cryptographic terminology.

## New device

```text
Your protected history is available.

This is a new authorized device.
Restore access to your previous private records?

[Restore Private History]
[Use Future Records Only]
```

## Existing device approval

```text
Approve this recovery request from one of your previously authorized devices.
```

## Recovery credential

```text
Use your recovery passkey to restore protected history.
```

## Unrecoverable history

```text
Historical private records cannot be restored because no authorized device or recovery credential is available.

Future private records will remain protected on this device.
```

## Host application contract

Integrating applications receive safe states and actions only:

- `device-authorization-required`;
- `recovery-available`;
- `recovery-in-progress`;
- `recovery-complete`;
- `recovery-unavailable`;
- `locked`;
- `authorized`;
- `expired`.

Receipt plaintext, wallets, signatures, PRU data, raw DEKs, private keys, and settlement metadata never appear in host callbacks or component events.
