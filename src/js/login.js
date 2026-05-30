async function login() {
  $(".alert-warning").hide();

  // Ensure contracts are loaded
  const connected = await connect(); 
  if (!connected) {
    alert("Unable to connect to Ethereum. Please check your wallet.");
    return;
  }

  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    if (accounts.length === 0) {
      alert("No accounts found in Metamask!");
      return;
    }

    const publicKey = accounts[0].toLowerCase();
    console.log("Logging in with account:", publicKey);

    // Check role
    const isPatient = await isUserInList(publicKey, "getPatientList");
    const isDoctor = await isUserInList(publicKey, "getDoctorList");
    const isProxy = await isUserInList(publicKey, "getProxyList");

    if (isPatient) location.href = `./patient.html?key=${publicKey}`;
    else if (isDoctor) location.href = `./doctor.html?key=${publicKey}`;
    else if (isProxy) location.href = `./proxy.html?key=${publicKey}`;
    else alert("Invalid user. Please register first.");
  } catch (err) {
    console.error("Login error:", err);
    alert("Error during login. Check console for details.");
  }
}

// Function to check if user is in the specific list of users
async function isUserInList(publicKey, listMethod) {
  try {
    // Retrieve the users in the list
    const result = await userRegistry.methods[listMethod]().call();

    const userList = result.map((user) => user.toLowerCase());

    //  Checks if the current public key is in the list of users, then it means the user has an account

    return userList.includes(publicKey);
  } catch (error) {
    console.error(`Error checking user in ${listMethod}:`, error);
    return false;
  }
}

$(document).ready(function () {
  $(window).scroll(function () {
    var scroll = $(window).scrollTop();
    if (scroll >= 50) {
      $("#mainNav").addClass("scroll-down");
    } else {
      $("#mainNav").removeClass("scroll-down");
    }
  });

  $("#signupButton").kendoButton({
    click: function () {
      // Redirect to the register.html page
      window.location.href = "register.html";
    },
  });

  // Define an array to hold the data for the steps
  var steps = [
    {
      title: "Register Yourself",
      description:
        "Join our community by registering as a patient, doctor or proxy.",
      iconClass: "fas fa-user-plus",
    },
    {
      title: "Log In",
      description:
        "Access your account using your secure credentials via Metamask.",
      iconClass: "fas fa-check-circle",
    },
    {
      title: "Manage Your Data",
      description:
        "Effortlessly create, access or sahre your medical records securely.",
      iconClass: "fas fa-upload",
    },
  ];

  // Iterate over the steps array to create the Kendo UI cards
  $.each(steps, function (index, step) {
    // Create a new card element
    var card = $('<div class="col-md-4">').append(
      $('<div class="k-card">').append(
        $('<div class="k-card-body text-center">').append(
          $("<span>").addClass(step.iconClass + " fa-3x"),
          $("<h4>").text(step.title),
          $("<p>").text(step.description)
        )
      )
    );

    // Append the card to the container
    $("#steps-cards").append(card);
  });

  // Enable Kendo UI styling on the dynamically added elements
  kendo.init($("#get-started"));

  $("a.nav-link").on("click", function (event) {
    if (this.hash !== "") {
      // Prevent default anchor click behavior
      event.preventDefault();

      // Store hash
      var hash = this.hash;

      // Using jQuery's animate() method to add smooth page scroll
      // The optional number (800) specifies the number of milliseconds it takes to scroll to the specified area
      $("html, body").animate(
        {
          scrollTop: $(hash).offset().top,
        },
        800,
        function () {
          // Add hash (#) to URL when done scrolling (default click behavior)
          window.location.hash = hash;
        }
      );
    } 
  });
});

// Make login accessible globally
window.login = login;

