// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stores only review digests. Source code, findings, memory, and keys stay off-chain.
contract BugMindReviewRegistry {
    struct Receipt {
        address issuer;
        uint64 recordedAt;
    }

    mapping(bytes32 => Receipt) public receipts;

    event ReviewRecorded(bytes32 indexed reviewDigest, address indexed issuer, uint64 recordedAt);

    function record(bytes32 reviewDigest) external {
        require(reviewDigest != bytes32(0), "empty digest");
        require(receipts[reviewDigest].recordedAt == 0, "already recorded");
        uint64 recordedAt = uint64(block.timestamp);
        receipts[reviewDigest] = Receipt(msg.sender, recordedAt);
        emit ReviewRecorded(reviewDigest, msg.sender, recordedAt);
    }
}
