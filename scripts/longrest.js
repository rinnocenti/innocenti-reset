/*
 * Tipos de descanço longo
 * 0 = Acampamento perigoso/improvisado
 * 1 = Acampamento seguro
 * 2 = Quarto Improvisado/ Acampamento alugado
 * 3 = Quarto Compartilhado
 * 4 = Quarto Individual
 * 5 = Quarto de Luxo
 */
import LongRestDialog from "../../../systems/dnd5e/module/apps/long-rest.js";


export let LongRest = async function (category = 0, dialog = true, newDay = true) {
    const actor = game.actors.entities.find(a => a.name === canvas.tokens.controlled[0].actor.name);
    const data = actor.data.data;
    if (dialog) {
        try {
            newDay = await LongRestDialog.longRestDialog({ actor: actor });
        } catch (err) {
            return;
        }
    }

    // Recover hit points to full, and eliminate any existing temporary HP
    let dhp = data.attributes.hp.max - data.attributes.hp.value;
    const updateData = {
        "data.attributes.hp.temp": 0,
        "data.attributes.hp.tempmax": 0
    };
    if (category <= 1) {
        let halfhp = Math.round(data.attributes.hp.max / 2);
        let conmod = (data.abilities.con.value - 10) / 2;
        dhp = (data.attributes.hp.value < halfhp) ? halfhp : data.attributes.hp.value + conmod;
        updateData["data.attributes.hp.value"] = dhp;
        dhp -= data.attributes.hp.value;
    } else {
        updateData["data.attributes.hp.value"] = data.attributes.hp.max;
    }
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
    
    // Determine the number of hit dice which may be recovered
    let recoverHD = 0;
    if (category === 0 || category === 2) {
        recoverHD = data.attributes.hd;
    } else if (category === 1 || category === 3) {
        recoverHD = 1;
    } else if (category === 4) {
        recoverHD = Math.max(Math.floor(data.details.level / 2), 1);
    } else {
        recoverHD = data.details.level;
    }
 
    let dhd = 0;
    // Sort classes which can recover HD, assuming players prefer recovering larger HD first.
    const updateItems = actor.items.filter(item => item.data.type === "class").sort((a, b) => {
        let da = parseInt(a.data.data.hitDice.slice(1)) || 0;
        let db = parseInt(b.data.data.hitDice.slice(1)) || 0;
        return db - da;
    }).reduce((updates, item) => {
        const d = item.data.data;
        if ((recoverHD > 0) && (d.hitDiceUsed > 0) && (category > 1)) {
            let delta = Math.min(d.hitDiceUsed || 0, recoverHD);
            recoverHD -= delta;
            dhd += delta;
            updates.push({ _id: item.id, "data.hitDiceUsed": d.hitDiceUsed - delta });
        }
        return updates;
        }, []);

    // Iterate over owned items, restoring uses per day and recovering Hit Dice
    const recovery = newDay ? ["sr", "lr", "day"] : ["sr", "lr"];
    for (let item of actor.items) {
        const d = item.data.data;
        if (d.uses && recovery.includes(d.uses.per)) {
            updateItems.push({ _id: item.id, "data.uses.value": d.uses.max });
        }
        else if (d.recharge && d.recharge.value) {
            updateItems.push({ _id: item.id, "data.recharge.charged": true });
        }
    }

    // Perform the updates
    await actor.update(updateData);
    if (updateItems.length) await actor.updateEmbeddedEntity("OwnedItem", updateItems);

    // Display a Chat Message summarizing the rest effects
    let restFlavor;
    switch (game.settings.get("dnd5e", "restVariant")) {
        case 'normal': restFlavor = game.i18n.localize(newDay ? "DND5E.LongRestOvernight" : "DND5E.LongRestNormal"); break;
        case 'gritty': restFlavor = game.i18n.localize("DND5E.LongRestGritty"); break;
        case 'epic': restFlavor = game.i18n.localize("DND5E.LongRestEpic"); break;
    }

    // Determine the chat message to display
    if (chat) {
        let lrMessage = "DND5E.LongRestResultShort";
        if ((dhp !== 0) && (dhd !== 0)) lrMessage = "DND5E.LongRestResult";
        else if ((dhp !== 0) && (dhd === 0)) lrMessage = "DND5E.LongRestResultHitPoints";
        else if ((dhp === 0) && (dhd !== 0)) lrMessage = "DND5E.LongRestResultHitDice";
        ChatMessage.create({
            user: game.user._id,
            speaker: { actor: actor, alias: actor.name },
            flavor: restFlavor,
            content: game.i18n.format(lrMessage, { name: actor.name, health: dhp, dice: dhd })
        });
    }

    // Return data summarizing the rest effects
    return {
        dhd: dhd,
        dhp: dhp,
        updateData: updateData,
        updateItems: updateItems,
        newDay: newDay
    }
}
