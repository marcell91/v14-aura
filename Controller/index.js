const { BEWRK, CustomStatus, RichPresence, SpotifyRPC } = require('./Classes/Client');
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');


function clearCache(modulePath) {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}


let Settings = clearCache('./settings.json');
const Spotify = clearCache('./Spotify/Data.json');

let clients = []; 
let obj = {
    selfMute: false,
    selfDeaf: false,
};


fs.watch('./settings.json', (eventType, filename) => {
    if (filename) {
        console.log(`${filename} dosyasında bir değişiklik tespit edildi.`);
        Settings = clearCache('./settings.json'); 
        processNewTokens(Settings);
    }
});


loadSettings();

function loadSettings() {
    Settings.tokens.forEach((token, index) => {
        let channel = Settings.channels[index] || Settings.channels[0];
        addClientToDatabase(token, channel);
    });

    loadClientsFromDatabase();
}

function processNewTokens(newSettings) {
    newSettings.tokens.forEach((token, index) => {
        let channel = newSettings.channels[index] || newSettings.channels[0];
        if (!clients.some(client => client.token === token)) {
  
            const client = new BEWRK();
            client.login(token).then(() => {
                console.log(`Yeni token doğrulandı ve veritabanına kaydediliyor: ${token}`);
                addClientToDatabase(token, channel); 
                createClient(token, channel, index); 
                removeTokenFromSettings(token, index);
            }).catch(() => {
                console.log(`Hatalı token bulundu ve settings.json'dan kaldırılıyor: ${token}`);
                removeTokenFromSettings(token, index);
            });
        }
    });
}

function addClientToDatabase(token, channel) {
    const adapter = new FileSync('./Databases/tokens.json');
    const db = low(adapter);

  
    db.defaults({ tokens: [] }).write();

   
    if (!db.get('tokens').find({ token }).value()) {
        db.get('tokens').push({ token, channel }).write();
    }
}

function removeTokenFromSettings(token, index) {
    
    Settings.tokens = Settings.tokens.filter((t, i) => i !== index);
    Settings.channels = Settings.channels.filter((c, i) => i !== index);
    fs.writeFileSync('./settings.json', JSON.stringify(Settings, null, 2));
}

function loadClientsFromDatabase() {
    const adapter = new FileSync('./Databases/tokens.json');
    const db = low(adapter);

    const tokens = db.get('tokens').value();
    tokens.forEach((entry, index) => {
        if (!clients.some(client => client.token === entry.token)) {
            createClient(entry.token, entry.channel, index);
        }
    });
}

function createClient(token, channel, index) {
    const client = new BEWRK();
    client.token = token; 
    clients.push(client); 

    client.login(token).catch(async (err) => {
        console.log(`${index + 1}. Satırdaki token arızalı olduğundan kaldırıldı.`);

       
        const adapter = new FileSync('./Databases/tokens.json');
        const db = low(adapter);
        db.get('tokens').remove({ token }).write();

     
        const faultyDatabasePath = `./Databases/${client.user?.tag || token}.json`;
        if (fs.existsSync(faultyDatabasePath)) {
            fs.unlinkSync(faultyDatabasePath);
        }
    });

    client.on('ready', async () => {
        const dirDatabase = new FileSync(`./Databases/${client.user.tag}.json`);
        const Database = low(dirDatabase);
        Database.defaults({ channel: null }).write();

        let get_channel = await Database.get("channel").value();
        let find = client.channels.cache.get(get_channel) || client.channels.cache.get(channel);
        if (!find) return console.log(`[${client.user.tag}] Kanal bulunamadığından giriş yapamadı.`);
        
        client.joinChannel(find, obj);
        if (!get_channel) await Database.set("channel", find.id).write();
        if (get_channel && get_channel != find.id) await Database.set("channel", find.id).write();

        client.user.setStatus("dnd");
        RPC(client);
    });

    client.on("presenceUpdate", (oldPresence, newPresence) => {
        if (!oldPresence || !newPresence || !oldPresence.member || !newPresence.member) return;
        if (oldPresence.member.id != client.user.id || newPresence.member.id != client.user.id) return;
        client.user.setStatus("dnd");
        RPC(client);
        console.log(`[${client.user.tag}] Rahatsız etmeyin dışında olduğu için otomatik olarak rahatsız etmeyin yapıldı.`);
    });

    client.on("voiceStateUpdate", async (oldState, newState) => {
        if (oldState.channel && !newState.channel && client.user.id == oldState.id) {
            console.log(`[${client.user.tag}] Kanaldan Düştü Tekrardan Giriş Yapılacak.`);
            setTimeout(async () => {
                const dirDatabase = new FileSync(`./Databases/${client.user.tag}.json`);
                const Database = low(dirDatabase);
                let get_channel = await Database.get("channel").value();
                let find = client.channels.cache.get(get_channel) || client.channels.cache.get(channel);
                if (!find) return console.log(`[${client.user.tag}] Kanal bulunamadığından giriş yapamadı.`);
                client.joinChannel(find, obj);
            }, 2300);
        }
        if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            if (oldState.member.id == client.user.id) {
                console.log(`[${client.user.tag}] Kanalı ${oldState.channel.name} kanalından ${newState.channel.name} kanalı olarak değiştirildi.`);
                const dirDatabase = new FileSync(`./Databases/${client.user.tag}.json`);
                const Database = low(dirDatabase);
                await Database.set("channel", newState.channelId).write();
            }
        }
    });
}

function RPC(client, game) {
    if (game) {
        return;
    }
    let SpotifyObj = Spotify.items.map(x => {
        let artist = x.track.album.artists.map(x => x.name).join(", ");
        let artistid = x.track.album.artists.map(x => x.id);
        let album = x.track.album.name;
        let albumid = String(x.track.album.uri.replace("spotify:album:", ""));
        let id = x.track.id;
        let track = x.track.name;
        let image = String(x.track.album.images[0].url.replace("https://i.scdn.co/image/", ""));
        let duration = x.track.duration_ms;
        return {
            id,
            artist,
            artistid,
            album,
            albumid,
            track,
            image,
            duration,
        };
    });

    let Track = SpotifyObj[Math.floor(Math.random() * SpotifyObj.length)];
    setTimeout(() => {
        RPC(client);
    }, Track.duration);

    client.user.setActivity(new SpotifyRPC(client)
        .setAssetsLargeImage(`spotify:${Track.image}`)
        .setAssetsLargeText(Track.album)
        .setState(`${Track.artist}`)
        .setDetails(Track.track)
        .setStartTimestamp(Date.now())
        .setEndTimestamp(Date.now() + Track.duration)
        .setSongId(Track.id)
        .setAlbumId(Track.albumid)
        .setArtistIds(Track.artistid));
}
