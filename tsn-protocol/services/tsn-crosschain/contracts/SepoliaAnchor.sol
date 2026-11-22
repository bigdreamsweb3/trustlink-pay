// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title SepoliaAnchor
/// @notice Records the public evidence tuple for one TSN exit on an EVM source chain.
/// @dev Historical research only, with no enabled Ethereum L1 integration.
///      This is an evidence anchor, not a custody bridge. It stores no TIN plaintext,
///      device key, private balance, or Solana account state.
contract SepoliaAnchor {
    struct Anchor {
        bytes32 digest;
        bytes32 sealedTipHeadHash;
        uint256 amount;
        bytes32 tinHash;
        bytes32 exitCommitment;
        uint64 blockNumber;
    }

    mapping(bytes32 => Anchor) public anchors;

    event TinExitAnchored(
        bytes32 indexed settlementId,
        bytes32 sealedTipHeadHash,
        uint256 amount,
        bytes32 tinHash,
        bytes32 exitCommitment
    );

    error InvalidField(string field);
    error SettlementAlreadyAnchored(bytes32 settlementId);

    function recordTinExit(
        bytes32 settlementId,
        bytes32 sealedTipHeadHash,
        uint256 amount,
        bytes32 tinHash,
        bytes32 exitCommitment
    ) external returns (bytes32 digest) {
        if (settlementId == bytes32(0)) revert InvalidField("settlementId");
        if (sealedTipHeadHash == bytes32(0)) revert InvalidField("sealedTipHeadHash");
        if (amount == 0) revert InvalidField("amount");
        if (tinHash == bytes32(0)) revert InvalidField("tinHash");
        if (exitCommitment == bytes32(0)) revert InvalidField("exitCommitment");
        if (anchors[settlementId].digest != bytes32(0)) {
            revert SettlementAlreadyAnchored(settlementId);
        }

        digest = keccak256(
            abi.encode(
                "TSN_CROSS_CHAIN_ANCHOR_V1",
                settlementId,
                sealedTipHeadHash,
                amount,
                tinHash,
                exitCommitment
            )
        );

        anchors[settlementId] = Anchor({
            digest: digest,
            sealedTipHeadHash: sealedTipHeadHash,
            amount: amount,
            tinHash: tinHash,
            exitCommitment: exitCommitment,
            blockNumber: uint64(block.number)
        });

        emit TinExitAnchored(
            settlementId,
            sealedTipHeadHash,
            amount,
            tinHash,
            exitCommitment
        );
    }

    function getAnchorDigest(bytes32 settlementId) external view returns (bytes32) {
        return anchors[settlementId].digest;
    }
}
