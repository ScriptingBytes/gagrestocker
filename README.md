
# GAG Restocker Webhook for Discord

This is a Grow a Garden restock webhook which scrapes data from websites and formats the data into a readable format in the form of a Discord webhook posted in a channel of your choice.

## How it works

This is an automatic webhook poster to where every 5 to 30 minutes the appropriate stock updates will be sent in different embeds in the channel you have the webhook assigned to.

For whatever reason that the scraper is not working, and the item stock is not matching up to the in-game stock, then the embeds will not be duplicated and sent out as a safety precaution.

The webhook will also ping roles that are assigned under the roleMap in the 'StockNotifier.js' file

## How to build your own webhook

Clone the git repo and install the packages using the following command.

```bash
npm i axios dotenv blessed@0.1.81 express@5.1.0
```

The command above will allow the server to run without causing errors.

---

Under the '.env' file you will find one entry for your Discord Webhook.

There is some more changable settings under the 'config.json' file to where you can either change the port, disable the dashboard and some IP whitelisting settings.

After changing all the necessary things in the repo to start the webhook process run the 'start.bat' file.

---

## Questions

If you have any further questions about this repo feel free to contact me via Discord my user is: scriptingbytes
