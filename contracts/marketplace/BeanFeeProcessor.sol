pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./interface/IWETH.sol";

error BEAN_NotOwnerOrAdmin();
error PROC_TransferFailed();

contract BeanFeeProcessor is Ownable {

    // Fees are out of 10000, to allow for 0.01 - 9.99% fees.
    uint256 public devFee = 100; //1%
    uint256 public beanieHolderFee = 100; //1%
    uint256 public beanBuybackFee = 100; //1%
    uint256 public totalFee = 300;

    uint256 public accruedAdminFeesEth;
    uint256 public accruedAdminFees;

    IWETH public TOKEN; //WETH, NOVA
    address public devAddress = 0x24312a0b911fE2199fbea92efab55e2ECCeC637D;
    address public beanieHolderAddress = 0xdA6367C6510d8f2D20A345888f9Dff3eb3226B02;
    address public beanBuybackAddress = 0xE9b8258668E17AFA5D09de9F10381dE5565dbDc0;

    bool autoSendFees = true;

    mapping(address => bool) administrators;

    modifier onlyAdmins() {
        if (!(administrators[_msgSender()] || owner() == _msgSender()))
            revert BEAN_NotOwnerOrAdmin();
        _;
    }

    constructor(address _TOKEN) {
        TOKEN = IWETH(_TOKEN);
        administrators[msg.sender] = true;
        // approveSelf();
    }

    function calculateAmounts(
        uint256 amount
    ) private view returns(uint256, uint256, uint256) {
        uint256 totalFee_ = totalFee;
        uint256 devAmount = amount * devFee / totalFee_;
        uint256 beanieHolderAmount = amount * beanieHolderFee / totalFee_;
        uint256 beanBuybackAmount = amount - devAmount - beanieHolderAmount;
        return(devAmount, beanieHolderAmount, beanBuybackAmount);
    }

    function processDevFeesEth() external onlyOwner {
        (
            uint256 devAmount,
            uint256 beanieHolderAmount,
            uint256 beanBuybackAmount
        ) = calculateAmounts(address(this).balance);
        _processDevFeesEth(
            devAmount,
            beanieHolderAmount,
            beanBuybackAmount
        );
    }

    function _processDevFeesEth(
        uint256 devAmount,
        uint256 beanieHolderAmount,
        uint256 beanBuybackAmount
    ) private {
        if (devAmount != 0)
            _sendEth(devAddress, devAmount);
        if (beanieHolderAmount != 0)
            _sendEth(beanieHolderAddress, beanieHolderAmount);
        if (beanBuybackAmount != 0)
            _sendEth(beanBuybackAddress, beanBuybackAmount);
    }

    function setAutoSendFees(bool _value) external onlyOwner {
        autoSendFees = _value;
    }

    function setDevAddress(address _address) external onlyOwner {
        devAddress = _address;
    }

    function setBeanieHolderAddress(address _address) external onlyOwner {
        beanieHolderAddress = _address;
    }

    function setBeanBuybackAddress(address _address) external onlyOwner {
        beanBuybackAddress = _address;
    }

    function setDevFee(uint256 fee) external onlyOwner {
        require(fee <= 1000, "Max 10% fee");
        devFee = fee;
        totalFee = fee + beanieHolderFee + beanBuybackFee;
    }

    function setBeanieHolderFee(uint256 fee) external onlyOwner {
        require(fee <= 1000, "Max 10% fee");
        beanieHolderFee = fee;
        totalFee = devFee + fee + beanBuybackFee;
    }

    function setBeanBuyBackFee(uint256 fee) external onlyOwner {
        require(fee <= 1000, "Max 10% fee");
        beanBuybackFee = fee;
        totalFee = devFee + beanieHolderFee + fee;
    }

    function _sendEth(address _address, uint256 _amount) private {
        (bool success, ) = _address.call{value: _amount}("");
        if (!success) revert PROC_TransferFailed();
    }

    function approveSelf() public onlyAdmins() {
        TOKEN.approve(address(this), type(uint256).max);
    }

    receive() external payable {
        if (autoSendFees) {
            (
                uint256 devAmount,
                uint256 beanieHolderAmount,
                uint256 beanBuybackAmount
            ) = calculateAmounts(msg.value);
            _processDevFeesEth(
                devAmount,
                beanieHolderAmount,
                beanBuybackAmount
            );
        }
    }
}