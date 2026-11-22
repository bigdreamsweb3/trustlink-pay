// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title DestinationLiquidityRegistry
/// @notice Retained registry prototype for destination EVM routes and their
///         latest proof-backed liquidity observations.
/// @dev Research only; its former verifier/executor runtime is retired.
///      This contract does not custody tokens. A designated recorder records
///      observations; the destination payout vault remains the source of value.
contract DestinationLiquidityRegistry {
    struct Route {
        bool enabled;
        uint64 sourceChainKey;
        address sourceEmitter;
        address payoutVault;
        address token;
        bytes32 destinationNetwork;
        uint256 destinationChainId;
        address destinationExecutor;
        address outbox;
    }

    struct LiquidityObservation {
        uint256 availableAmount;
        uint256 sourceBlock;
        uint256 observedAt;
        uint256 validUntil;
        uint256 nonce;
        bytes32 queryId;
    }

    address public owner;
    address public liquidityASC;
    address public settlementHub;

    mapping(bytes32 => Route) public routes;
    mapping(bytes32 => LiquidityObservation) public latestObservation;
    mapping(bytes32 => uint256) public reservedAmount;
    mapping(bytes32 => mapping(bytes32 => uint256)) public reservations;

    error Unauthorized();
    error InvalidRoute();
    error InvalidObservation();
    error RouteDisabled(bytes32 routeId);
    error InsufficientVerifiedLiquidity(uint256 requested, uint256 available);
    error ReservationExists(bytes32 settlementId);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event LiquidityASCUpdated(address indexed previousASC, address indexed newASC);
    event SettlementHubUpdated(address indexed previousHub, address indexed newHub);
    event RouteConfigured(
        bytes32 indexed routeId,
        uint64 indexed sourceChainKey,
        address sourceEmitter,
        address payoutVault,
        address token,
        bytes32 destinationNetwork,
        uint256 destinationChainId,
        address destinationExecutor,
        address outbox,
        bool enabled
    );
    event LiquidityVerified(
        bytes32 indexed routeId,
        bytes32 indexed queryId,
        uint256 availableAmount,
        uint256 sourceBlock,
        uint256 validUntil,
        uint256 nonce
    );
    event LiquidityReserved(bytes32 indexed routeId, bytes32 indexed settlementId, uint256 amount);
    event LiquidityReservationReleased(bytes32 indexed routeId, bytes32 indexed settlementId, uint256 amount);

    constructor(address liquidityASC_) {
        owner = msg.sender;
        liquidityASC = liquidityASC_;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function configureRoute(
        bytes32 routeId,
        uint64 sourceChainKey,
        address sourceEmitter,
        address payoutVault,
        address token,
        bool enabled
    ) external onlyOwner {
        if (routeId == bytes32(0) || sourceChainKey == 0 || sourceEmitter == address(0) ||
            payoutVault == address(0) || token == address(0)) revert InvalidRoute();
        routes[routeId] = Route(
            enabled,
            sourceChainKey,
            sourceEmitter,
            payoutVault,
            token,
            bytes32(0),
            0,
            address(0),
            address(0)
        );
        emit RouteConfigured(
            routeId,
            sourceChainKey,
            sourceEmitter,
            payoutVault,
            token,
            bytes32(0),
            0,
            address(0),
            address(0),
            enabled
        );
    }

    /// @notice Configure the retained prototype route; no current TSN runtime consumes it.
    /// @dev A route is not executable until its destination executor and Outbox
    ///      are both registered. The proof fields remain bound to the same route.
    function configureSettlementRoute(
        bytes32 routeId,
        uint64 sourceChainKey,
        address sourceEmitter,
        address payoutVault,
        address token,
        bytes32 destinationNetwork,
        uint256 destinationChainId,
        address destinationExecutor,
        address outbox,
        bool enabled
    ) external onlyOwner {
        if (
            routeId == bytes32(0) ||
            sourceChainKey == 0 ||
            sourceEmitter == address(0) ||
            payoutVault == address(0) ||
            token == address(0) ||
            destinationNetwork == bytes32(0) ||
            destinationChainId == 0 ||
            destinationExecutor == address(0) ||
            outbox == address(0)
        ) revert InvalidRoute();
        routes[routeId] = Route(
            enabled,
            sourceChainKey,
            sourceEmitter,
            payoutVault,
            token,
            destinationNetwork,
            destinationChainId,
            destinationExecutor,
            outbox
        );
        emit RouteConfigured(
            routeId,
            sourceChainKey,
            sourceEmitter,
            payoutVault,
            token,
            destinationNetwork,
            destinationChainId,
            destinationExecutor,
            outbox,
            enabled
        );
    }

    function setLiquidityASC(address nextASC) external onlyOwner {
        if (nextASC == address(0)) revert InvalidRoute();
        emit LiquidityASCUpdated(liquidityASC, nextASC);
        liquidityASC = nextASC;
    }

    function setSettlementHub(address nextHub) external onlyOwner {
        if (nextHub == address(0)) revert InvalidRoute();
        emit SettlementHubUpdated(settlementHub, nextHub);
        settlementHub = nextHub;
    }

    function getRoute(bytes32 routeId) external view returns (Route memory) {
        return routes[routeId];
    }

    function recordVerifiedLiquidity(
        bytes32 routeId,
        bytes32 queryId,
        uint256 availableAmount,
        uint256 sourceBlock,
        uint256 validUntil,
        uint256 nonce
    ) external onlyASC {
        Route memory route = routes[routeId];
        if (!route.enabled || sourceBlock == 0 || queryId == bytes32(0) || validUntil <= block.timestamp) {
            revert InvalidObservation();
        }
        LiquidityObservation memory previous = latestObservation[routeId];
        if (nonce <= previous.nonce) revert InvalidObservation();
        latestObservation[routeId] = LiquidityObservation(
            availableAmount,
            sourceBlock,
            block.timestamp,
            validUntil,
            nonce,
            queryId
        );
        emit LiquidityVerified(routeId, queryId, availableAmount, sourceBlock, validUntil, nonce);
    }

    function isLiquidityAvailable(bytes32 routeId, uint256 amount) public view returns (bool) {
        Route memory route = routes[routeId];
        LiquidityObservation memory observation = latestObservation[routeId];
        if (!route.enabled || observation.validUntil < block.timestamp) return false;
        uint256 reserved = reservedAmount[routeId];
        return observation.availableAmount >= reserved + amount;
    }

    function isSettlementRouteActive(bytes32 routeId) external view returns (bool) {
        Route memory route = routes[routeId];
        return route.enabled &&
            route.destinationChainId != 0 &&
            route.destinationExecutor != address(0) &&
            route.outbox != address(0);
    }

    function reserveLiquidity(bytes32 routeId, bytes32 settlementId, uint256 amount) external onlyHub {
        if (settlementId == bytes32(0) || amount == 0) revert InvalidObservation();
        if (reservations[routeId][settlementId] != 0) revert ReservationExists(settlementId);
        LiquidityObservation memory observation = latestObservation[routeId];
        if (!isLiquidityAvailable(routeId, amount)) {
            revert InsufficientVerifiedLiquidity(amount, observation.availableAmount);
        }
        reservations[routeId][settlementId] = amount;
        reservedAmount[routeId] += amount;
        emit LiquidityReserved(routeId, settlementId, amount);
    }

    function releaseLiquidity(bytes32 routeId, bytes32 settlementId, uint256 amount) external onlyHub {
        uint256 reserved = reservations[routeId][settlementId];
        if (reserved == 0 || amount != reserved || amount > reservedAmount[routeId]) revert InvalidObservation();
        reservedAmount[routeId] -= amount;
        reservations[routeId][settlementId] = 0;
        emit LiquidityReservationReleased(routeId, settlementId, amount);
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert Unauthorized();
        emit OwnershipTransferred(owner, nextOwner);
        owner = nextOwner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyASC() {
        if (msg.sender != liquidityASC) revert Unauthorized();
        _;
    }

    modifier onlyHub() {
        if (msg.sender != settlementHub) revert Unauthorized();
        _;
    }
}
