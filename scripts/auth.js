// listen for auth status changes
// auth.onAuthStateChanged(user => {
//   if (user) {
//     db.ref('sensors').once('value', snapshot => {
//       setupUI(user);
//       console.log('Received list of sensors', snapshot.val());
//       setupSensors(snapshot.val());
//     }, err => console.log(err.message));
//   } else {
//     setupUI();
//     setupSensors({});
//   }
// });

auth.onAuthStateChanged(user => {
  if (user) {
    setupUI(user);
    db.ref('sensorsList').on('value', snapshot => {
      console.log('Received list of sensors', snapshot.val());
      setupSensors(snapshot.val());
    }, err => console.log(err.message));
  } else {
    db.ref('sensorsList').off();
    setupUI();
    setupSensors(null);
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

// Current card order becomes sensorsList/{id}/position. A bare MAC string cannot
// take a child, so that entry is rewritten as { mac, position }.
function writeSensorOrder() {
  const ul = document.querySelector('ul.sensors');
  if (!ul) return Promise.resolve();
  return db.ref('sensorsList').once('value').then(snapshot => {
    const list = snapshot.val() || {};
    const refreshObj = {};
    const items = ul.querySelectorAll(':scope > li[data-sensor-id]');
    for (let i = 0; i < items.length; i++) {
      const id = items[i].dataset.sensorId;
      if (typeof list[id] === 'string') refreshObj[id] = { mac: list[id], position: i + 1 };
      else if (list[id]) refreshObj[id + '/position'] = i + 1;
    }
    if (!Object.keys(refreshObj).length) return;
    return db.ref('sensorsList').update(refreshObj);
  });
}

// save layout
document.querySelectorAll('.save-layout').forEach(a => a.addEventListener('click', doSaveLayout));
function doSaveLayout(e) {
  e.preventDefault();

  confirmDialog(`Поновити порядок сенсорів ?`).then((result) => {
    if (result) {
      writeSensorOrder().then(() => {
        alert("Successfully updated layout");
      }).catch(err => alert(err.message));
    }
  });

};

// Empty limit clears the Firebase key. undefined means the field is not a number.
function readLimitField(input) {
  const raw = input.value.trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// update sensor information
const updateSensorForm = document.querySelector('#update-sensor-form');
updateSensorForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const tempMin = readLimitField(updateSensorForm.tempMin);
  const tempMax = readLimitField(updateSensorForm.tempMax);
  if (tempMin === undefined || tempMax === undefined) {
    alert('Мін і Макс мають бути числами або порожніми');
    return;
  }
  db.ref('sensors/' + updateSensorForm.sensorId.value + '/info').update({
    roomName: updateSensorForm.roomName.value,
    sensorName: updateSensorForm.sensorName.value,
    sensorType: updateSensorForm.sensorType.value,
    tempMin: tempMin,
    tempMax: tempMax
  }).then(() => {
    // close the create modal & reset form
    const modal = document.querySelector('#modal-update-sensor');
    M.Modal.getInstance(modal).close();
    updateSensorForm.reset();
  }).catch(err => {
    alert(err.message);
  });
});

// send refresh command to sensor 
function fbRefreshSensor(sensorMac) {
  return new Promise((resolve, reject) => {
    if (!sensorMac) return reject(`Empty Sensor MAC address`);

    let refreshObj = {};
    refreshObj[sensorMac] = 'refresh';
    db.ref('commands').update(refreshObj).then(() => {
      resolve("Successfully sent refresh command to " + sensorMac);
    }).catch(err => {
      reject(err.message);
    });
  });
  
};

// delete sensor information
function fbDeleteSensor(sensorId) {
  return new Promise((resolve, reject) => {
    if (!sensorId) return reject(`Empty Sensor Identifier`);
    
    let delPath = {};
    delPath['temperatures/' + sensorId] = null;
    delPath['sensors/' + sensorId] = null;
    delPath['sensorsList/' + sensorId] = null;
    delPath['uptime/' + sensorId] = null;

    db.ref().update(delPath).then(() => {
      resolve("Successfully deleted");
    }).catch(err => {
      reject(err.message);
    });
  });
  
};
