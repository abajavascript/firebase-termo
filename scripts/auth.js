// listen for auth status changes
auth.onAuthStateChanged(user => {
  if (user) {
    db.ref('sensors').once('value', snapshot => {
      setupUI(user);
      console.log('Received list of sensors', snapshot.val());
      setupSensors(snapshot.val());
    }, err => console.log(err.message));
  } else {
    setupUI();
    setupSensors({});
  }
});

// signup
const signupForm = document.querySelector('#signup-form');
signupForm.addEventListener('submit', (e) => {
  e.preventDefault();

  // get user info
  const email = signupForm['signup-email'].value;
  const password = signupForm['signup-password'].value;

  // sign up the user & add firestore data
  auth.createUserWithEmailAndPassword(email, password).then(cred => {
    return true;
    //the idea was to add somewhere notification that new user was signed-up
    //but I need to have write access to this branch and some how limit access to only add and read only about own email, etc
    //for further investigation
    // return db.ref('newusers').set({
    //   uui: cred.user.uid,
    //   email: cred.user.email,
    //   reason: signupForm['signup-reason'].value
    // });
  }).catch(e => {
    alert(e);
  }).then(() => {
    // close the signup modal & reset form
    const modal = document.querySelector('#modal-signup');
    M.Modal.getInstance(modal).close();
    signupForm.reset();
    //after signup worth to add login code as we dont have any email confirmations
  });
});

// login
const loginForm = document.querySelector('#login-form');
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();

  // get user info
  const email = loginForm['login-email'].value;
  const password = loginForm['login-password'].value;

  // log the user in
  auth.signInWithEmailAndPassword(email, password).then((cred) => {
    // close the signup modal & reset form
    const modal = document.querySelector('#modal-login');
    M.Modal.getInstance(modal).close();
    loginForm.reset();
  }).catch(e => {
    alert(e);
  });

});

// logout
const logout = document.querySelector('#logout');
const logoutMobile = document.querySelector('#logout-mobile');
logout.addEventListener('click', doLogout);
logoutMobile.addEventListener('click', doLogout);
function doLogout(e) {
  e.preventDefault();
  auth.signOut();
};

// create new guide
const updateSensorForm = document.querySelector('#update-sensor-form');
updateSensorForm.addEventListener('submit', (e) => {
  e.preventDefault();
  db.collection('guides').add({
    title: updateSensorForm.title.value,
    content: updateSensorForm.content.value
  }).then(() => {
    // close the create modal & reset form
    const modal = document.querySelector('#modal-update-sensor');
    M.Modal.getInstance(modal).close();
    updateSensorForm.reset();
  }).catch(err => {
    console.log(err.message);
  });
});

