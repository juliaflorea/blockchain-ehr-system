connect();
async function login() {
  $(".alert-warning").hide();

  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });

    if (accounts.length === 0) {
      console.error("No accounts found");
      $(".alert-warning").show();
      return;
    }

    const publicKey = accounts[0].toLowerCase();
    console.log(publicKey);

    const isPatient = await isUserInList(publicKey, "get_patient_list");
    const isDoctor = await isUserInList(publicKey, "get_doctor_list");
    const isProxy = await isUserInList(publicKey, "get_proxy_list");

    if (isPatient) {
      location.href = `./patient.html?key=${publicKey}`;
    } else if (isDoctor) {
      location.href = `./doctor.html?key=${publicKey}`;
    } else if (isProxy) {
      location.href = `./proxy.html?key=${publicKey}`; // Redirect proxy users to the proxy dashboard
    } else {
      console.log("Invalid User!");
      $(".alert-warning").show();
    }
  } catch (error) {
    console.error("Error during login:", error);
    $(".alert-warning").show();
  }
}

async function isUserInList(publicKey, listMethod) {
  try {
    const result = await contractInstance.methods[listMethod]().call();
    const userList = result.map((user) => user.toLowerCase());
    return userList.includes(publicKey);
  } catch (error) {
    console.error(`Error checking user in ${listMethod}:`, error);
    return false;
  }
}
