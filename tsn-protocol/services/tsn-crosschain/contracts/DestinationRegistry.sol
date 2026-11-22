// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title DestinationRegistry
/// @notice Append-only, community-voted destination route admission.
/// @dev Retained governance research only. A configured attestor records an
///      admission digest; no current TSN runtime consumes this registry and
///      signature admission does not prove source-chain or destination settlement.
contract DestinationRegistry {
    using ECDSA for bytes32;

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant ROUTE_TYPEHASH = keccak256(
        "RouteProposal(bytes32 routeId,uint256 destinationChainId,bytes32 destinationNetwork,address executor,address stablecoin,bytes32 solanaEvidenceHash,uint256 deadline)"
    );
    bytes32 private constant NAME_HASH = keccak256("TSN Destination Registry");
    bytes32 private constant VERSION_HASH = keccak256("1");

    struct Route {
        uint256 destinationChainId;
        bytes32 destinationNetwork;
        address executor;
        address stablecoin;
        bytes32 solanaEvidenceHash;
        address attestor;
        uint64 proposedAt;
        uint64 votingEndsAt;
        uint64 activationAt;
        uint32 voteCount;
        bool active;
    }

    address public immutable routeAttestor;
    address public immutable emergencyGuardian;
    uint32 public immutable quorum;
    uint64 public immutable votingPeriod;
    uint64 public immutable activationDelay;

    mapping(bytes32 => Route) public routes;
    mapping(bytes32 => mapping(address => bool)) public hasVoted;

    error InvalidConfiguration();
    error InvalidRoute();
    error InvalidSignature();
    error RouteExists();
    error RouteMissing();
    error VotingClosed();
    error AlreadyVoted();
    error QuorumNotReached();
    error ActivationTooEarly();
    error AlreadyActive();
    error UnauthorizedGuardian();

    event RouteProposed(
        bytes32 indexed routeId,
        uint256 indexed destinationChainId,
        bytes32 destinationNetwork,
        address executor,
        address stablecoin,
        bytes32 solanaEvidenceHash,
        uint64 votingEndsAt,
        address attestor
    );
    event RouteVoted(bytes32 indexed routeId, address indexed voter, uint32 voteCount);
    event RouteActivated(bytes32 indexed routeId, uint64 activationAt);
    event RouteDeactivated(bytes32 indexed routeId, address indexed guardian);

    constructor(
        address routeAttestor_,
        address emergencyGuardian_,
        uint32 quorum_,
        uint64 votingPeriod_,
        uint64 activationDelay_
    ) {
        if (
            routeAttestor_ == address(0) ||
            emergencyGuardian_ == address(0) ||
            quorum_ == 0 ||
            votingPeriod_ == 0
        ) revert InvalidConfiguration();
        routeAttestor = routeAttestor_;
        emergencyGuardian = emergencyGuardian_;
        quorum = quorum_;
        votingPeriod = votingPeriod_;
        activationDelay = activationDelay_;
    }

    function proposeRoute(
        bytes32 routeId,
        uint256 destinationChainId,
        bytes32 destinationNetwork,
        address executor,
        address stablecoin,
        bytes32 solanaEvidenceHash,
        uint256 deadline,
        bytes calldata attestorSignature
    ) external {
        if (
            routeId == bytes32(0) ||
            destinationChainId == 0 ||
            destinationNetwork == bytes32(0) ||
            executor == address(0) ||
            stablecoin == address(0) ||
            solanaEvidenceHash == bytes32(0) ||
            deadline < block.timestamp
        ) revert InvalidRoute();
        if (routes[routeId].proposedAt != 0) revert RouteExists();

        bytes32 digest = _routeDigest(
            routeId,
            destinationChainId,
            destinationNetwork,
            executor,
            stablecoin,
            solanaEvidenceHash,
            deadline
        );
        if (digest.recover(attestorSignature) != routeAttestor) revert InvalidSignature();

        uint64 nowTime = uint64(block.timestamp);
        uint64 endsAt = nowTime + votingPeriod;
        uint64 activatesAt = endsAt + activationDelay;
        routes[routeId] = Route({
            destinationChainId: destinationChainId,
            destinationNetwork: destinationNetwork,
            executor: executor,
            stablecoin: stablecoin,
            solanaEvidenceHash: solanaEvidenceHash,
            attestor: routeAttestor,
            proposedAt: nowTime,
            votingEndsAt: endsAt,
            activationAt: activatesAt,
            voteCount: 0,
            active: false
        });
        emit RouteProposed(
            routeId,
            destinationChainId,
            destinationNetwork,
            executor,
            stablecoin,
            solanaEvidenceHash,
            endsAt,
            routeAttestor
        );
    }

    function voteForRoute(bytes32 routeId) external {
        Route storage route = routes[routeId];
        if (route.proposedAt == 0) revert RouteMissing();
        if (block.timestamp > route.votingEndsAt) revert VotingClosed();
        if (hasVoted[routeId][msg.sender]) revert AlreadyVoted();
        hasVoted[routeId][msg.sender] = true;
        route.voteCount += 1;
        emit RouteVoted(routeId, msg.sender, route.voteCount);
    }

    function activateRoute(bytes32 routeId) external {
        Route storage route = routes[routeId];
        if (route.proposedAt == 0) revert RouteMissing();
        if (route.active) revert AlreadyActive();
        if (route.voteCount < quorum) revert QuorumNotReached();
        if (block.timestamp < route.activationAt) revert ActivationTooEarly();
        route.active = true;
        emit RouteActivated(routeId, route.activationAt);
    }

    function deactivateRoute(bytes32 routeId) external {
        if (msg.sender != emergencyGuardian) revert UnauthorizedGuardian();
        Route storage route = routes[routeId];
        if (route.proposedAt == 0) revert RouteMissing();
        route.active = false;
        emit RouteDeactivated(routeId, msg.sender);
    }

    function getRoute(bytes32 routeId) external view returns (Route memory) {
        return routes[routeId];
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function _routeDigest(
        bytes32 routeId,
        uint256 destinationChainId,
        bytes32 destinationNetwork,
        address executor,
        address stablecoin,
        bytes32 solanaEvidenceHash,
        uint256 deadline
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ROUTE_TYPEHASH,
                routeId,
                destinationChainId,
                destinationNetwork,
                executor,
                stablecoin,
                solanaEvidenceHash,
                deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }
}
