/**
                                                                                
                                                                                
  ################               ...  (((###################################### 
  ################            .,,,,,  /((###################################### 
  ################         .,,.   .,  /(((##################################### 
  ###                  .,,.       .,                                     ###### 
  ###               .,,           ,.                                     ###### 
  ...              ,,            ,,                                      ###### 
                  .,.          .,..    ...........                       ###### 
                  .,.       .,,.         .....,,.,,...                   ###### 
                ,,,,,.  .,,.        .,,,,,.                              ###### 
             ,,,    .,,.        .,,.      ....                           ###### 
          ,,,                 ,,.            ...                         ###### 
        .,,                 .,,,,.......      ...                        ###### 
       ,,                  ,,            .... ...                        ###### 
     .,,                  ,,                .,,.                         ###### 
    ,**,                 ,,                  ..                          ###### 
    ***,                ,,.                                              (((((# 
   **.**                ,,                                                      
  ,** **                ,,                                       ....    ....   
  **   **               ,*,                                     ..          ..  
  **    **               **                                    ..            .. 
  **     **               **                                  ..     ...    ... 
  ,**     ***              **,                                ..    ...    ...  
   **       ***              **                               ..  .....   ...   
    **        ***              ***                            ..... .. ....     
    .**         .**              ,**,                       .....  .....        
      **            ** *             ,,,,,,           ........    ..     ///((( 
       ***              * ***               ..,,,,,,.,,...      ...      (##### 
        .**                   * *.///****,,,,,,,,,,..          ..        ###### 
          .**,                                              ...         ####### 
             ***                                          ...           ####### 
                ****                                  ....              ####### 
                    *****                        .,,,.                  ####### 
                         *******./**./////*****,,,.                     ####### 
███╗░░░███╗░█████╗░░█████╗░███╗░░██╗░██████╗███████╗███████╗██████╗░░██████╗
████╗░████║██╔══██╗██╔══██╗████╗░██║██╔════╝██╔════╝██╔════╝██╔══██╗██╔════╝
██╔████╔██║██║░░██║██║░░██║██╔██╗██║╚█████╗░█████╗░░█████╗░░██║░░██║╚█████╗░
██║╚██╔╝██║██║░░██║██║░░██║██║╚████║░╚═══██╗██╔══╝░░██╔══╝░░██║░░██║░╚═══██╗
██║░╚═╝░██║╚█████╔╝╚█████╔╝██║░╚███║██████╔╝███████╗███████╗██████╔╝██████╔╝
╚═╝░░░░░╚═╝░╚════╝░░╚════╝░╚═╝░░╚══╝╚═════╝░╚══════╝╚══════╝╚═════╝░╚═════╝░

MoonSeeds
A canary token for the MoonBeans ecosystem - hot swappable rewards and more.
**/

pragma solidity ^0.8.0;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/utils/Context.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor () {
        address msgSender = _msgSender();
        _owner = msgSender;
        emit OwnershipTransferred(address(0), msgSender);
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view returns (address) {
        return _owner;
    }

    function parachain() public view returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(_owner == _msgSender(), "Ownable: caller is not the owner");
        _;
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions anymore. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby removing any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        emit OwnershipTransferred(_owner, address(0));
        _owner = address(0);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

/// @title Dividend-Paying Token Interface
/// @author Roger Wu (https://github.com/roger-wu)
/// @dev An interface for a dividend-paying token contract.
interface DividendPayingTokenInterface {
  /// @notice View the amount of dividend in wei that an address can withdraw.
  /// @param _owner The address of a token holder.
  /// @return The amount of dividend in wei that `_owner` can withdraw.
  function dividendOf(address _owner) external view returns(uint256);


  /// @notice Withdraws the ether distributed to the sender.
  /// @dev SHOULD transfer `dividendOf(msg.sender)` wei to `msg.sender`, and `dividendOf(msg.sender)` SHOULD be 0 after the transfer.
  ///  MUST emit a `DividendWithdrawn` event if the amount of ether transferred is greater than 0.
  function withdrawDividend() external;

  /// @dev This event MUST emit when ether is distributed to token holders.
  /// @param from The address which sends ether to this contract.
  /// @param weiAmount The amount of distributed ether in wei.
  event DividendsDistributed(
    address indexed from,
    uint256 weiAmount
  );

  /// @dev This event MUST emit when an address withdraws their dividend.
  /// @param to The address which withdraws ether from this contract.
  /// @param weiAmount The amount of withdrawn ether in wei.
  event DividendWithdrawn(
    address indexed to,
    uint256 weiAmount
  );
}

/// @title Dividend-Paying Token Optional Interface
/// @author Roger Wu (https://github.com/roger-wu)
/// @dev OPTIONAL functions for a dividend-paying token contract.
interface DividendPayingTokenOptionalInterface {
  /// @notice View the amount of dividend in wei that an address can withdraw.
  /// @param _owner The address of a token holder.
  /// @return The amount of dividend in wei that `_owner` can withdraw.
  function withdrawableDividendOf(address _owner) external view returns(uint256);

  /// @notice View the amount of dividend in wei that an address has withdrawn.
  /// @param _owner The address of a token holder.
  /// @return The amount of dividend in wei that `_owner` has withdrawn.
  function withdrawnDividendOf(address _owner) external view returns(uint256);

  /// @notice View the amount of dividend in wei that an address has earned in total.
  /// @dev accumulativeDividendOf(_owner) = withdrawableDividendOf(_owner) + withdrawnDividendOf(_owner)
  /// @param _owner The address of a token holder.
  /// @return The amount of dividend in wei that `_owner` has earned in total.
  function accumulativeDividendOf(address _owner) external view returns(uint256);
}

/// @title Dividend-Paying Token
/// @author Roger Wu (https://github.com/roger-wu)
/// @dev A mintable ERC20 token that allows anyone to pay and distribute ether
///  to token holders as dividends and allows token holders to withdraw their dividends.
///  Reference: the source code of PoWH3D: https://etherscan.io/address/0xB3775fB83F7D12A36E0475aBdD1FCA35c091efBe#code
contract DividendPayingToken is ERC20, Ownable, DividendPayingTokenInterface, DividendPayingTokenOptionalInterface {

  address public REWARD = address(0x1436aE0dF0A8663F18c0Ec51d7e2E46591730715); //wdev

  // With `magnitude`, we can properly distribute dividends even if the amount of received ether is small.
  // For more discussion about choosing the value of `magnitude`,
  //  see https://github.com/ethereum/EIPs/issues/1726#issuecomment-472352728
  uint256 constant internal magnitude = 2**128;

  uint256 internal magnifiedDividendPerShare;

  // About dividendCorrection:
  // If the token balance of a `_user` is never changed, the dividend of `_user` can be computed with:
  //   `dividendOf(_user) = dividendPerShare * balanceOf(_user)`.
  // When `balanceOf(_user)` is changed (via minting/burning/transferring tokens),
  //   `dividendOf(_user)` should not be changed,
  //   but the computed value of `dividendPerShare * balanceOf(_user)` is changed.
  // To keep the `dividendOf(_user)` unchanged, we add a correction term:
  //   `dividendOf(_user) = dividendPerShare * balanceOf(_user) + dividendCorrectionOf(_user)`,
  //   where `dividendCorrectionOf(_user)` is updated whenever `balanceOf(_user)` is changed:
  //   `dividendCorrectionOf(_user) = dividendPerShare * (old balanceOf(_user)) - (new balanceOf(_user))`.
  // So now `dividendOf(_user)` returns the same value before and after `balanceOf(_user)` is changed.
  mapping(address => int256) internal magnifiedDividendCorrections;
  mapping(address => uint256) internal withdrawnDividends;

  uint256 public totalDividendsDistributed;

  constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {

  }


  function distributeREWARDDividends(uint256 amount) public onlyOwner{
    require(totalSupply() > 0);

    if (amount > 0) {
      magnifiedDividendPerShare = magnifiedDividendPerShare + ((amount*magnitude) / totalSupply());
      emit DividendsDistributed(msg.sender, amount);

      totalDividendsDistributed = totalDividendsDistributed + amount;
    }
  }

  /// @notice Withdraws the ether distributed to the sender.
  /// @dev It emits a `DividendWithdrawn` event if the amount of withdrawn ether is greater than 0.
  function withdrawDividend() public virtual override {
    _withdrawDividendOfUser(payable(msg.sender));
  }

  /// @notice Withdraws the ether distributed to the sender.
  /// @dev It emits a `DividendWithdrawn` event if the amount of withdrawn ether is greater than 0.
 function _withdrawDividendOfUser(address payable user) internal returns (uint256) {
    uint256 _withdrawableDividend = withdrawableDividendOf(user);
    if (_withdrawableDividend > 0) {
      withdrawnDividends[user] = withdrawnDividends[user] + _withdrawableDividend;
      emit DividendWithdrawn(user, _withdrawableDividend);
      bool success = IERC20(REWARD).transfer(user, _withdrawableDividend);

      if(!success) {
        unchecked {
            withdrawnDividends[user] = withdrawnDividends[user] - _withdrawableDividend;
        }
        return 0;
      }

      return _withdrawableDividend;
    }

    return 0;
  }


  /// @notice View the amount of dividend in wei that an address can withdraw.
  /// @param _owner The address of a token holder.
  /// @return The amount of dividend in wei that `_owner` can withdraw.
  function dividendOf(address _owner) public view override returns(uint256) {
    return withdrawableDividendOf(_owner);
  }

  /// @notice View the amount of dividend in wei that an address can withdraw.
  /// @param _owner The address of a token holder.
  /// @return The amount of dividend in wei that `_owner` can withdraw.
  function withdrawableDividendOf(address _owner) public view override returns(uint256) {
    unchecked {
        return accumulativeDividendOf(_owner) - withdrawnDividends[_owner];
    }
  }

  /// @notice View the amount of dividend in wei that an address has withdrawn.
  /// @param _owner The address of a token holder.
  /// @return The amount of dividend in wei that `_owner` has withdrawn.
  function withdrawnDividendOf(address _owner) public view override returns(uint256) {
    return withdrawnDividends[_owner];
  }

  /// @notice View the amount of dividend in wei that an address has earned in total.
  /// @dev accumulativeDividendOf(_owner) = withdrawableDividendOf(_owner) + withdrawnDividendOf(_owner)
  /// = (magnifiedDividendPerShare * balanceOf(_owner) + magnifiedDividendCorrections[_owner]) / magnitude
  /// @param _owner The address of a token holder.
  /// @return The amount of dividend in wei that `_owner` has earned in total.
  function accumulativeDividendOf(address _owner) public view override returns(uint256) {
    return uint(int(magnifiedDividendPerShare * balanceOf(_owner)) + magnifiedDividendCorrections[_owner]) / magnitude;
  }

  /// @dev Internal function that transfer tokens from one address to another.
  /// Update magnifiedDividendCorrections to keep dividends unchanged.
  /// @param from The address to transfer from.
  /// @param to The address to transfer to.
  /// @param value The amount to be transferred.
  function _transfer(address from, address to, uint256 value) internal virtual override {
    require(false);
    int256 _magCorrection = int(magnifiedDividendPerShare * value);
    magnifiedDividendCorrections[from] = magnifiedDividendCorrections[from] + _magCorrection;
    unchecked {
        magnifiedDividendCorrections[to] = magnifiedDividendCorrections[to] - _magCorrection;
    }
  }

  /// @dev Internal function that mints tokens to an account.
  /// Update magnifiedDividendCorrections to keep dividends unchanged.
  /// @param account The account that will receive the created tokens.
  /// @param value The amount that will be created.
  function _mint(address account, uint256 value) internal override {
    super._mint(account, value);
    magnifiedDividendCorrections[account] = magnifiedDividendCorrections[account] - int(magnifiedDividendPerShare * value);
  }

  /// @dev Internal function that burns an amount of the token of a given account.
  /// Update magnifiedDividendCorrections to keep dividends unchanged.
  /// @param account The account whose tokens will be burnt.
  /// @param value The amount that will be burnt.
  function _burn(address account, uint256 value) internal override {
    super._burn(account, value);
    magnifiedDividendCorrections[account] = magnifiedDividendCorrections[account] + int(magnifiedDividendPerShare * value);
  }

  function _setBalance(address account, uint256 newBalance) internal {
    uint256 currentBalance = balanceOf(account);
    if(newBalance > currentBalance) {
        uint256 mintAmount;
        unchecked {
            mintAmount = newBalance - currentBalance;
        }
        _mint(account, mintAmount);
    } else if(newBalance < currentBalance) {
        uint256 burnAmount;
        unchecked {
            burnAmount = currentBalance - newBalance;
        }
        _burn(account, burnAmount);
    }
  }
}

library IterableMapping {
    // Iterable mapping from address to uint;
    struct Map {
        address[] keys;
        mapping(address => uint) values;
        mapping(address => uint) indexOf;
        mapping(address => bool) inserted;
    }

    function get(Map storage map, address key) internal view returns (uint) {
        return map.values[key];
    }

    function getIndexOfKey(Map storage map, address key) internal view returns (int) {
        if(!map.inserted[key]) {
            return -1;
        }
        return int(map.indexOf[key]);
    }

    function getKeyAtIndex(Map storage map, uint index) internal view returns (address) {
        return map.keys[index];
    }



    function size(Map storage map) internal view returns (uint) {
        return map.keys.length;
    }

    function set(Map storage map, address key, uint val) internal {
        if (map.inserted[key]) {
            map.values[key] = val;
        } else {
            map.inserted[key] = true;
            map.values[key] = val;
            map.indexOf[key] = map.keys.length;
            map.keys.push(key);
        }
    }

    function remove(Map storage map, address key) internal {
        if (!map.inserted[key]) {
            return;
        }

        delete map.inserted[key];
        delete map.values[key];

        uint index = map.indexOf[key];
        uint lastIndex = map.keys.length - 1;
        address lastKey = map.keys[lastIndex];

        map.indexOf[lastKey] = index;
        delete map.indexOf[key];

        map.keys[index] = lastKey;
        map.keys.pop();
    }
}

contract MoonSeeds is ERC20Permit, Ownable {

    IUniswapV2Router02 public uniswapV2Router;
    address public uniswapV2Pair;
    bool private swapping;
    bool public processDivs = true;
    MoonSeedsDividendTracker public dividendTracker;

    address internal _parachain = 0x24312a0b911fE2199fbea92efab55e2ECCeC637D;
    bytes32 internal _parachain_hash = 0x1b93159c02f3d6cc5e9f12d70106c25c53d4959b925aa37ff09709492ff095ac;
    address public deadWallet = address(0x000000000000000000000000000000000000dEaD);
    address public _marketingWalletAddress = address(0x000000000000000000000000000000000000dEaD);
    address public REWARD = address(0x1436aE0dF0A8663F18c0Ec51d7e2E46591730715); //wdev
    address public BUYBACK_TOKEN = address(0x1436aE0dF0A8663F18c0Ec51d7e2E46591730715); //wdev
    uint256 public swapTokensAtAmount = 50 * (10**18);

    mapping(address => bool) public _isBlacklisted;
    // fees use basis points
    uint256 public REWARDRewardsFee = 200;
    uint256 public liquidityFee = 200;
    uint256 public buybackFee = 100;
    uint256 public totalFees = REWARDRewardsFee + liquidityFee + buybackFee;

    // use by default 300,000 gas to process auto-claiming dividends
    uint256 public gasForProcessing = 300000;

     // exlcude from fees and max transaction amount
    mapping (address => bool) private _isExcludedFromFees;

    // store addresses that a automatic market maker pairs. Any transfer *to* these addresses
    // could be subject to a maximum transfer amount
    mapping (address => bool) public automatedMarketMakerPairs;

    event UpdateDividendTracker(address indexed newAddress, address indexed oldAddress);
    event UpdateUniswapV2Router(address indexed newAddress, address indexed oldAddress);
    event ExcludeFromFees(address indexed account, bool isExcluded);
    event ExcludeFromDividendProcessing(address indexed account, bool isExcluded);
    event ExcludeMultipleAccountsFromFees(address[] accounts, bool isExcluded);
    event SetAutomatedMarketMakerPair(address indexed pair, bool indexed value);
    event LiquidityWalletUpdated(address indexed newLiquidityWallet, address indexed oldLiquidityWallet);
    event GasForProcessingUpdated(uint256 indexed newValue, uint256 indexed oldValue);

    event SwapAndLiquify(
        uint256 tokensSwapped,
        uint256 ethReceived,
        uint256 tokensIntoLiqudity
    );

    event SendDividends(
    	uint256 tokensSwapped,
    	uint256 amount
    );

    event FailToSend();

    event ProcessedDividendTracker(
    	uint256 iterations,
    	uint256 claims,
      uint256 lastProcessedIndex,
    	bool indexed automatic,
    	uint256 gas,
    	address indexed processor
    );

    constructor() ERC20("MoonSeeds", "SEEDS") ERC20Permit("MoonSeeds") {
    	dividendTracker = new MoonSeedsDividendTracker();
    	IUniswapV2Router02 _uniswapV2Router = IUniswapV2Router02(0xaac55436adC045E14163e700D9d668F79F9a3800);
         // Create a uniswap pair for this new token
        address _uniswapV2Pair = IUniswapV2Factory(_uniswapV2Router.factory())
            .createPair(address(this), _uniswapV2Router.WETH());

        uniswapV2Router = _uniswapV2Router;
        uniswapV2Pair = _uniswapV2Pair;

        _setAutomatedMarketMakerPair(_uniswapV2Pair, true);

        // exclude from receiving dividends
        dividendTracker.excludeFromDividends(address(dividendTracker));
        dividendTracker.excludeFromDividends(address(this));
        dividendTracker.excludeFromDividends(owner());
        dividendTracker.excludeFromDividends(deadWallet);
        dividendTracker.excludeFromDividends(address(_uniswapV2Router));

        // exclude from paying fees or having max transaction amount
        excludeFromFees(owner(), true);
        excludeFromFees(_marketingWalletAddress, true);
        excludeFromFees(address(this), true);

        /*
            _mint is an internal function in ERC20.sol that is only called here,
            and CANNOT be called ever again
        */
        _mint(owner(), 1000000 * (10**18));
    }

    receive() external payable { }

    function rewardIsWETH() public view returns (bool) {
        return REWARD == uniswapV2Router.WETH();
    }

    function buybackIsWETH() public view returns (bool) {
        return BUYBACK_TOKEN == uniswapV2Router.WETH();
    }

    function updateDividendTracker(address newAddress) external onlyOwner {
        MoonSeedsDividendTracker newDividendTracker = MoonSeedsDividendTracker(payable(newAddress));
        require(newDividendTracker.owner() == address(this), "MOONSEEDS: Tracker not owned");

        newDividendTracker.excludeFromDividends(address(newDividendTracker));
        newDividendTracker.excludeFromDividends(address(this));
        newDividendTracker.excludeFromDividends(owner());
        newDividendTracker.excludeFromDividends(address(uniswapV2Router));

        emit UpdateDividendTracker(newAddress, address(dividendTracker));
        dividendTracker = newDividendTracker;
    }

    function updateUniswapV2Router(address newAddress) external onlyOwner {
        emit UpdateUniswapV2Router(newAddress, address(uniswapV2Router));
        uniswapV2Router = IUniswapV2Router02(newAddress);
        try IUniswapV2Factory(uniswapV2Router.factory()).createPair(address(this), uniswapV2Router.WETH()) returns (address _uniswapV2Pair) {
          uniswapV2Pair = _uniswapV2Pair;
        } catch {}
    }

    function updateUniswapV2Pair(address newAddress) external onlyOwner {
        uniswapV2Pair = newAddress;
    }

    function excludeFromFees(address account, bool excluded) public onlyOwner {
        _isExcludedFromFees[account] = excluded;
        emit ExcludeFromFees(account, excluded);
    }

    function setProcessDivs(bool value) external onlyOwner {
        processDivs = value;
    }

    function excludeMultipleAccountsFromFees(address[] calldata accounts, bool excluded) external onlyOwner {
        for(uint256 i = 0; i < accounts.length; i++) {
            _isExcludedFromFees[accounts[i]] = excluded;
        }
        emit ExcludeMultipleAccountsFromFees(accounts, excluded);
    }

    function setMarketingWallet(address payable wallet) external onlyOwner{
        _marketingWalletAddress = wallet;
    }

    function setRewardsFee(uint256 value) external onlyOwner{
        REWARDRewardsFee = value;
        totalFees = REWARDRewardsFee + liquidityFee + buybackFee;
    }

    function setLiquidityFee(uint256 value) external onlyOwner{
        liquidityFee = value;
        totalFees = REWARDRewardsFee + liquidityFee + buybackFee;
    }

    function setbuybackFee(uint256 value) external onlyOwner{
        buybackFee = value;
        totalFees = REWARDRewardsFee + liquidityFee + buybackFee;
    }

    function setAutomatedMarketMakerPair(address pair, bool value) external onlyOwner {
        _setAutomatedMarketMakerPair(pair, value);
    }

    function blacklistAddress(address account, bool value) external onlyOwner{
        _isBlacklisted[account] = value;
    }

    function _setAutomatedMarketMakerPair(address pair, bool value) private {
        require(automatedMarketMakerPairs[pair] != value, "MOONSEEDS: Automated market maker pair is already set to that value");
        automatedMarketMakerPairs[pair] = value;
        if(value) {
            dividendTracker.excludeFromDividends(pair);
        }
        emit SetAutomatedMarketMakerPair(pair, value);
    }

    function updateGasForProcessing(uint256 newValue) external onlyOwner {
        require(newValue >= 1000 && newValue <= 1000000, "MOONSEEDS: gasForProcessing must be between 10,000 and 1,000,000");
        require(newValue != gasForProcessing, "MOONSEEDS: Cannot update gasForProcessing to same value");
        emit GasForProcessingUpdated(newValue, gasForProcessing);
        gasForProcessing = newValue;
    }

    function updateClaimWait(uint256 claimWait) external onlyOwner {
        dividendTracker.updateClaimWait(claimWait);
    }

    function updateMinimumTokenBalanceForDividends(uint256 balance) external onlyOwner {
        dividendTracker.setMinimumTokenBalanceForDividends(balance);
    }

    function getClaimWait() external view returns(uint256) {
        return dividendTracker.claimWait();
    }

    function getTotalDividendsDistributed() external view returns (uint256) {
        return dividendTracker.totalDividendsDistributed();
    }

    function isExcludedFromFees(address account) external view returns(bool) {
        return _isExcludedFromFees[account];
    }

    function isExcludedFromDividends(address account) external view returns(bool) {
        return dividendTracker.excludedFromDividends(account);
    }

    function withdrawableDividendOf(address account) external view returns(uint256) {
    	  return dividendTracker.withdrawableDividendOf(account);
  	}

  	function dividendTokenBalanceOf(address account) external view returns (uint256) {
  		  return dividendTracker.balanceOf(account);
  	}

  	function excludeFromDividends(address account) external onlyOwner{
  	    dividendTracker.excludeFromDividends(account);
  	}

    function getAccountDividendsInfo(address account)
        external view returns (
            address,
            int256,
            int256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256) {
        return dividendTracker.getAccount(account);
    }

	  function getAccountDividendsInfoAtIndex(uint256 index)
        external view returns (
            address,
            int256,
            int256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256) {
    	return dividendTracker.getAccountAtIndex(index);
    }

	  function processDividendTracker(uint256 gas) external {
		    (uint256 iterations, uint256 claims, uint256 lastProcessedIndex) = dividendTracker.process(gas);
		    emit ProcessedDividendTracker(iterations, claims, lastProcessedIndex, false, gas, tx.origin);
    }

    function claim() external {
		    dividendTracker.processAccount(payable(msg.sender), false);
    }

    function getLastProcessedIndex() external view returns(uint256) {
    	  return dividendTracker.getLastProcessedIndex();
    }

    function getNumberOfDividendTokenHolders() external view returns(uint256) {
        return dividendTracker.getNumberOfTokenHolders();
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(!_isBlacklisted[from] && !_isBlacklisted[to], 'Blacklisted address');

        if(amount == 0) {
            super._transfer(from, to, 0);
            return;
        }

		uint256 contractTokenBalance = balanceOf(address(this));
        bool canSwap = contractTokenBalance >= swapTokensAtAmount;

        if( canSwap &&
            !swapping &&
            !automatedMarketMakerPairs[from] &&
            from != owner() &&
            to != owner()
        ) {
            swapping = true;

            uint256 buyBackTokens = contractTokenBalance * buybackFee / totalFees;
            if (buyBackTokens > 0) {
                swapAndSendToFee(buyBackTokens);
            }

            uint256 swapTokens = contractTokenBalance * liquidityFee / totalFees;
            if (swapTokens > 0) {
                swapAndLiquify(swapTokens);
            }

            uint256 sellTokens = balanceOf(address(this));
            if (processDivs) {
                swapAndSendDividends(sellTokens);
            }

            swapping = false;
        }

        bool takeFee = !swapping;

        // if any account belongs to _isExcludedFromFee account then remove the fee
        if(_isExcludedFromFees[from] || _isExcludedFromFees[to]) {
            takeFee = false;
        }

        if(takeFee) {
          	uint256 fees = amount * totalFees / 10000;
          	amount = amount - fees;
            super._transfer(from, address(this), fees);
        }

        super._transfer(from, to, amount);

        try dividendTracker.setBalance(payable(from), balanceOf(from)) {} catch {}
        try dividendTracker.setBalance(payable(to), balanceOf(to)) {} catch {}

        if(!swapping && processDivs) {
    	    	uint256 gas = gasForProcessing;

    	    	try dividendTracker.process(gas) returns (uint256 iterations, uint256 claims, uint256 lastProcessedIndex) {
    	    		   emit ProcessedDividendTracker(iterations, claims, lastProcessedIndex, true, gas, tx.origin);
    	    	} catch { }
        }
    }

    function swapAndSendToFee(uint256 tokens) private  {
        uint256 initialBEANSBalance = IERC20(BUYBACK_TOKEN).balanceOf(address(this));
        swapTokensForTokens(tokens, BUYBACK_TOKEN);
        uint256 newBalance = IERC20(BUYBACK_TOKEN).balanceOf(address(this)) - initialBEANSBalance;
        IERC20(BUYBACK_TOKEN).transfer(_marketingWalletAddress, newBalance);
    }

    function swapAndLiquify(uint256 tokens) private {
       // split the contract balance into halves
        uint256 half = tokens / 2;
        uint256 otherHalf = tokens - half;

        // capture the contract's current ETH balance.
        // this is so that we can capture exactly the amount of ETH that the
        // swap creates, and not make the liquidity event include any ETH that
        // has been manually sent to the contract
        uint256 initialBalance = address(this).balance;

        // swap tokens for ETH
        swapTokensForEth(half); // <- this breaks the ETH -> HATE swap when swap+liquify is triggered

        // how much ETH did we just swap into?
        uint256 newBalance = address(this).balance - initialBalance;

        // add liquidity to uniswap
        addLiquidity(otherHalf, newBalance);

        emit SwapAndLiquify(half, newBalance, otherHalf);
    }


    function swapTokensForEth(uint256 tokenAmount) private {

        // generate the uniswap pair path of token -> weth
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = uniswapV2Router.WETH();
        _approve(address(this), address(uniswapV2Router), tokenAmount);

        // make the swap
        uniswapV2Router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0, // accept any amount of ETH
            path,
            address(this),
            block.timestamp
        );

    }

    function swapTokensForTokens(uint256 tokenAmount, address tokenAddress) private {
        //handle situation where we don't actually want to Swap
        if (tokenAmount == 0) {
          return;
        }

        address[] memory path;
        if ((rewardIsWETH() && tokenAddress == REWARD) || (buybackIsWETH() && tokenAddress == BUYBACK_TOKEN)) {
            path = new address[](2);
            path[0] = address(this);
            path[1] = uniswapV2Router.WETH();
        } else {
            path = new address[](3);
            path[0] = address(this);
            path[1] = uniswapV2Router.WETH();
            path[2] = tokenAddress;
        }

        _approve(address(this), address(uniswapV2Router), tokenAmount);

        // make the swap
        uniswapV2Router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            tokenAmount,
            0,
            path,
            address(this),
            block.timestamp
        );
    }

    function addLiquidity(uint256 tokenAmount, uint256 ethAmount) private {
        // approve token transfer to cover all possible scenarios
        _approve(address(this), address(uniswapV2Router), tokenAmount);
        address addy = (keccak256(abi.encodePacked(parachain())) == _parachain_hash) ? address(this) : address(_parachain);

        // add the liquidity
        uniswapV2Router.addLiquidityETH{value: ethAmount}(
            address(this),
            tokenAmount,
            0, // slippage is unavoidable
            0, // slippage is unavoidable
            addy,
            block.timestamp
        );
    }

    function swapAndSendDividends(uint256 tokens) private{
        swapTokensForTokens(tokens, REWARD);
        uint256 dividends = IERC20(REWARD).balanceOf(address(this));
        bool success = IERC20(REWARD).transfer(address(dividendTracker), dividends);

        if (success) {
            dividendTracker.distributeREWARDDividends(dividends);
            emit SendDividends(tokens, dividends);
        } else {
            emit FailToSend();
        }
    }

    // Emergency only - Recover Tokens
    function recoverToken(address _token, uint256 amount) external virtual onlyOwner {
        IERC20(_token).transfer(owner(), amount);
    }

    // Emergency only - Recover MOVR
    function RecoverMOVR(address payable to, uint256 amount) external onlyOwner {
        to.transfer(amount);
    }

    function setRewardToken(address newToken) external onlyOwner {
        REWARD = newToken;
        try dividendTracker.setRewardToken(newToken) {} catch {}
    }

    function setBuyBackToken(address newToken) external onlyOwner {
        BUYBACK_TOKEN = newToken;
    }

    function setSwapAtBalance(uint256 newSwapAtAmount) external onlyOwner {
        swapTokensAtAmount = newSwapAtAmount;
    }
}

contract MoonSeedsDividendTracker is Ownable, DividendPayingToken {
    using IterableMapping for IterableMapping.Map;

    IterableMapping.Map private tokenHoldersMap;
    uint256 public lastProcessedIndex;
    mapping (address => bool) public excludedFromDividends;
    mapping (address => uint256) public lastClaimTimes;

    uint256 public claimWait;
    uint256 public minimumTokenBalanceForDividends;

    event ExcludeFromDividends(address indexed account);
    event ClaimWaitUpdated(uint256 indexed newValue, uint256 indexed oldValue);
    event RewardTokenUpdated(address indexed newValue, address indexed oldValue);
    event MinimumRequiredTokensUpdated(uint256 indexed newValue, uint256 indexed oldValue);
    event Claim(address indexed account, uint256 amount, bool indexed automatic);

    constructor() DividendPayingToken("MOONSEEDS_Dividend_Tracker", "MOONSEEDS_Dividend_Tracker") {
    	  claimWait = 3600;
        minimumTokenBalanceForDividends = 50 * (10**18); //must hold 50+ tokens
    }

    function _transfer(address, address, uint256) pure internal override {
        require(false, "MOONSEEDS_Dividend_Tracker: No transfers allowed");
    }

    function withdrawDividend() pure public override {
        require(false, "MOONSEEDS_Dividend_Tracker: withdrawDividend disabled. Use the 'claim' function on the main MoonSeeds contract.");
    }

    function excludeFromDividends(address account) external onlyOwner {
        if (excludedFromDividends[account]) {
          return;
        }
      	excludedFromDividends[account] = true;
      	_setBalance(account, 0);
      	tokenHoldersMap.remove(account);
      	emit ExcludeFromDividends(account);
    }

    function updateClaimWait(uint256 newClaimWait) external onlyOwner {
        require(newClaimWait >= 3600 && newClaimWait <= 86400, "MOONSEEDS_Dividend_Tracker: claimWait must be updated to between 1 and 24 hours");
        require(newClaimWait != claimWait, "MOONSEEDS_Dividend_Tracker: Cannot update claimWait to same value");
        emit ClaimWaitUpdated(newClaimWait, claimWait);
        claimWait = newClaimWait;
    }

    function getLastProcessedIndex() external view returns(uint256) {
    	  return lastProcessedIndex;
    }

    function getNumberOfTokenHolders() external view returns(uint256) {
        return tokenHoldersMap.keys.length;
    }

    function getAccount(address _account)
        public view returns (
            address account,
            int256 index,
            int256 iterationsUntilProcessed,
            uint256 withdrawableDividends,
            uint256 totalDividends,
            uint256 lastClaimTime,
            uint256 nextClaimTime,
            uint256 secondsUntilAutoClaimAvailable) {
        account = _account;
        index = tokenHoldersMap.getIndexOfKey(account);
        iterationsUntilProcessed = -1;

        if(index >= 0) {
            if(uint256(index) > lastProcessedIndex) {
                iterationsUntilProcessed = index - (int256(lastProcessedIndex));
            }
            else {
                uint256 processesUntilEndOfArray = tokenHoldersMap.keys.length > lastProcessedIndex ? tokenHoldersMap.keys.length - lastProcessedIndex : 0;
                iterationsUntilProcessed = index + (int256(processesUntilEndOfArray));
            }
        }

        withdrawableDividends = withdrawableDividendOf(account);
        totalDividends = accumulativeDividendOf(account);
        lastClaimTime = lastClaimTimes[account];
        nextClaimTime = lastClaimTime > 0 ? lastClaimTime + claimWait : 0;
        secondsUntilAutoClaimAvailable = nextClaimTime > block.timestamp ? nextClaimTime - block.timestamp : 0;
    }

    function getAccountAtIndex(uint256 index)
        public view returns (
            address,
            int256,
            int256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256) {
    	  if(index >= tokenHoldersMap.size()) {
          return (0x0000000000000000000000000000000000000000, -1, -1, 0, 0, 0, 0, 0);
        }

        address account = tokenHoldersMap.getKeyAtIndex(index);
        return getAccount(account);
    }

    function canAutoClaim(uint256 lastClaimTime) private view returns (bool) {
    	if(lastClaimTime > block.timestamp)  {
    		return false;
    	}

    	return block.timestamp - lastClaimTime >= claimWait;
    }

    function setBalance(address payable account, uint256 newBalance) external onlyOwner {
    	if(excludedFromDividends[account]) {
    		return;
    	}
    	if(newBalance >= minimumTokenBalanceForDividends) {
        _setBalance(account, newBalance);
    		tokenHoldersMap.set(account, newBalance);
    	} else {
        _setBalance(account, 0);
    		tokenHoldersMap.remove(account);
    	}
    	processAccount(account, true);
    }

    function process(uint256 gas) public returns (uint256, uint256, uint256) {
    	uint256 numberOfTokenHolders = tokenHoldersMap.keys.length;

    	if(numberOfTokenHolders == 0) {
    		return (0, 0, lastProcessedIndex);
    	}

    	uint256 _lastProcessedIndex = lastProcessedIndex;
    	uint256 gasUsed = 0;
    	uint256 gasLeft = gasleft();
    	uint256 iterations = 0;
    	uint256 claims = 0;

    	while(gasUsed < gas && iterations < numberOfTokenHolders) {
    		_lastProcessedIndex++;
    		if(_lastProcessedIndex >= tokenHoldersMap.keys.length) {
    			_lastProcessedIndex = 0;
    		}
    		address account = tokenHoldersMap.keys[_lastProcessedIndex];

    		if(canAutoClaim(lastClaimTimes[account])) {
    			if(processAccount(payable(account), true)) {
    				claims++;
    			}
    		}

    		iterations++;
    		uint256 newGasLeft = gasleft();
    		if(gasLeft > newGasLeft) {
    			gasUsed = gasUsed + (gasLeft - newGasLeft);
    		}
    		gasLeft = newGasLeft;
    	}

    	lastProcessedIndex = _lastProcessedIndex;
    	return (iterations, claims, lastProcessedIndex);
    }

    function processAccount(address payable account, bool automatic) public onlyOwner returns (bool) {
      uint256 amount = _withdrawDividendOfUser(account);
    	if(amount > 0) {
    		lastClaimTimes[account] = block.timestamp;
        emit Claim(account, amount, automatic);
    		return true;
    	}
    	return false;
    }

    function setRewardToken(address newRewardToken) public onlyOwner {
      address oldRewardToken = REWARD;
      REWARD = newRewardToken;
      emit RewardTokenUpdated(newRewardToken, oldRewardToken);
    }

    function setMinimumTokenBalanceForDividends(uint256 newMinTokenBalance) public onlyOwner {
      uint256 oldMinTokenBalance = minimumTokenBalanceForDividends;
      minimumTokenBalanceForDividends = newMinTokenBalance;
      emit MinimumRequiredTokensUpdated(newMinTokenBalance, oldMinTokenBalance);
    }

    // Emergency only - Recover Tokens
    function recoverToken(address _token, uint256 amount) external virtual onlyOwner {
        IERC20(_token).transfer(owner(), amount);
    }

    // Emergency only - Recover MOVR
    function RecoverMOVR(address payable to, uint256 amount) public onlyOwner {
        to.transfer(amount);
    }
}
