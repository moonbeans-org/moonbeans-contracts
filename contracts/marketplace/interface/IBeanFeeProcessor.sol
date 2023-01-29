pragma solidity ^0.8.0;

interface IBeanFeeProcessor {
    function devFee() external view returns(uint256);
    function beanieHolderFee() external view returns(uint256);
    function beanBuybackFee() external view returns(uint256);
    function totalFee() external view returns(uint256);
}