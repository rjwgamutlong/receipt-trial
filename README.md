# Receipt to Excel (Trial) - setup

## 1. Get a Claude API key
1. Go to console.anthropic.com and sign in.
2. Add a small credit under Billing, and set a monthly spend limit so the cost can never run away.
3. Create an API key under API keys and copy it.

## 2. Put the project on GitHub
1. Create a new private repository on github.com.
2. Upload every file in this folder, keeping the folders (public, netlify/functions).

## 3. Deploy on Netlify (free plan)
1. Sign in at netlify.com, choose Add new site, Import an existing project, then pick your GitHub repo.
2. Leave the build settings as they are (netlify.toml sets them) and deploy.
3. Go to Site configuration, Environment variables, and add:
   - ANTHROPIC_API_KEY = your key from step 1
   - ACCESS_CODE = the trial code you will give the client, for example JADJ-TRIAL
   - TRIAL_MAX = 30
   - TRIAL_EXPIRES = a date such as 2026-11-15
4. Trigger a new deploy so the variables apply.

## 4. Test it
Open your Netlify link, enter the trial code, and add a receipt photo.
Before sending the link, edit the CONTACT block near the top of the script in public/index.html if the contact details are wrong.

## 5. Send to the client
Send the Netlify link and the trial code. The page locks with your contact details when the trial ends or the receipt cap is used up.

## Notes
- To restart a trial, change ACCESS_CODE to a new code. Each code has its own counter.
- Free Netlify functions stop after about 10 seconds. If long receipts time out, tell me and we will move the Function to a host without that limit.
- Receipt photos are sent to Claude to be read. Tell the client this.
