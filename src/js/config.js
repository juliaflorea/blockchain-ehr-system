(async function() {
  const response = await fetch("../../build/contracts/UserRegistry.json");
  const data = await response.json();

  window.contracts = {
    UserRegistry: {
      abi: data.abi,
      networks: data.networks
    }
  };
})();
