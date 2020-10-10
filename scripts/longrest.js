/*
 * Tipos de descanço longo
 * 0 = Acampamento perigoso/improvisado
 * 1 = Acampamento seguro
 * 2 = Quarto Improvisado/ Acampamento alugado
 * 3 = Quarto Compartilhado
 * 4 = Quarto Individual
 * 5 = Quarto de Luxo
 */

export let LongRest = async function (category = 0) {
    if (canvas.tokens.controlled.length === 0)
        return ui.notifications.error("select a token");
    for (let token of canvas.tokens.controlled) {
        const data = token.actor.data.data;
        // promessa de um dialogo..
        let dialog = false; ////////////////////////////////////////////////////////// <-----------------------
        let newDay = false;
        if (dialog) {
            try {
                newDay = await LongRestDialog(token.actor);
            } catch (err) {
                return;
            }
        }
        // Recover hit points to full, and eliminate any existing temporary HP
        const updateData = {
            "data.attributes.hp.temp": 0,
            "data.attributes.hp.tempmax": 0
        }
        if (category <= 1) {
            let halfhp = Math.round(data.attributes.hp.max / 2);
            let conmod = (data.abilities.con.value - 10) / 2;
            updateData["data.attributes.hp.value"] = (data.attributes.hp.value < halfhp) ? halfhp : data.attributes.hp.value + ((data.abilities.con.value - 10) / 2);
        } else {
            updateData["data.attributes.hp.value"] = data.attributes.hp.max;
        }
        //const dhp = data.attributes.hp.max - data.attributes.hp.value;
        // Recover character resources
        for (let [k, r] of Object.entries(data.resources)) {
            if (r.max && (r.sr || r.lr)) {
                updateData[`data.resources.${k}.value`] = r.max;
            }
        }
        // Recover spell slots
        for (let [k, v] of Object.entries(data.spells)) {
            if (!v.max && !v.override) continue;
            updateData[`data.spells.${k}.value`] = v.override || v.max;
        }

        // Recover pact slots.
        const pact = data.spells.pact;
        updateData['data.spells.pact.value'] = pact.override || pact.max;
        let recoverHD = 1;
        // Determine the number of hit dice which may be recovered
        if (category <= 1) {
            recoverHD = data.attributes.hd;
        } else if (category === 2 || category === 3) {
            recoverHD = 1;
        } else if (category === 4) {
            recoverHD = Math.max(Math.floor(data.details.level / 2), 1);
        } else {
            recoverHD = data.details.level;
        }
        //recover Exhaustion
        //ui.notifications.info(data.attributes.exhaustion);
        updateData["data.attributes.exhaustion"] = (data.attributes.exhaustion > 0) ? data.attributes.exhaustion - 1 : 0;

        let dhd = 0;
        // Sort classes which can recover HD, assuming players prefer recovering larger HD first.
        const updateItems = token.actor.items.filter(item => item.data.type === "class").sort((a, b) => {
            let da = parseInt(a.data.data.hitDice.slice(1)) || 0;
            let db = parseInt(b.data.data.hitDice.slice(1)) || 0;
            return db - da;
        }).reduce((updates, item) => {
            const d = item.data.data;
            if ((recoverHD > 0) && (d.hitDiceUsed > 0)) {
                let delta = Math.min(d.hitDiceUsed || 0, recoverHD);
                recoverHD -= delta;
                dhd += delta;
                updates.push({ _id: item.id, "data.hitDiceUsed": d.hitDiceUsed - delta });
            }
            return updates;
        }, []);

        // Iterate over owned items, restoring uses per day and recovering Hit Dice
        const recovery = newDay ? ["sr", "lr", "day"] : ["sr", "lr"];
        for (let item of token.actor.items) {
            const d = item.data.data;
            if (d.uses && recovery.includes(d.uses.per)) {
                updateItems.push({ _id: item.id, "data.uses.value": d.uses.max });
            }
            else if (d.recharge && d.recharge.value) {
                updateItems.push({ _id: item.id, "data.recharge.charged": true });
            }
        }
        // Perform the updates
        await token.actor.update(updateData);
        if (updateItems.length) await token.actor.updateEmbeddedEntity("OwnedItem", updateItems);
    }
    return;
}
async function LongRestDialog({ actor } = {}) {
    return new Promise((resolve, reject) => {
        const dlg = new this(actor, {
            title: "Long Rest",
            buttons: {
                rest: {
                    icon: '<i class="fas fa-bed"></i>',
                    label: "Rest",
                    callback: html => {
                        let newDay = false;
                        if (game.settings.get("dnd5e", "restVariant") === "normal")
                            newDay = html.find('input[name="newDay"]')[0].checked;
                        else if (game.settings.get("dnd5e", "restVariant") === "gritty")
                            newDay = true;
                        resolve(newDay);
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: reject
                }
            },
            default: 'rest',
            close: reject
        });
        dlg.render(true);
    });
}