import { Body } from "./body";
import { Contact } from "./narrowphase";
import { Vec2 } from "./vec2";

const CORRECTION_PERCENT = 0.4;
const PENETRATION_SLOP = 0.05;

/**
 * Impulse-based response:
 *   j = −(1+e)(v̄_ab·n̄) / (1/mₐ + 1/m_b + (r̄_ap×n̄)²/Iₐ + (r̄_bp×n̄)²/I_b)
 * Static bodies contribute 1/m = 1/I = 0. Skipped when already separating.
 * Velocity-only — run several iterations over a contact set generated once
 * per substep (re-detecting contacts per iteration is the expensive part).
 */
export function resolveVelocity(bodies: Body[], contact: Contact): void {
    const a = bodies[contact.a];
    const b = bodies[contact.b];
    const n = contact.normal;

    const rA = Vec2.sub(contact.point, a.pos);
    const rB = Vec2.sub(contact.point, b.pos);

    const velA = Vec2.add(a.vel, Vec2.crossScalar(a.angVel, rA));
    const velB = Vec2.add(b.vel, Vec2.crossScalar(b.angVel, rB));
    const relVel = Vec2.sub(velB, velA);
    const vn = Vec2.dot(relVel, n);

    if (vn < 0) {
        const e = Math.min(a.restitution, b.restitution);
        const rAxN = Vec2.cross(rA, n);
        const rBxN = Vec2.cross(rB, n);
        const denom =
            a.invMass +
            b.invMass +
            rAxN * rAxN * a.invInertia +
            rBxN * rBxN * b.invInertia;
        if (denom > 0) {
            const j = (-(1 + e) * vn) / denom;
            const impulse = Vec2.scale(n, j);
            a.vel = Vec2.sub(a.vel, Vec2.scale(impulse, a.invMass));
            a.angVel -= Vec2.cross(rA, impulse) * a.invInertia;
            b.vel = Vec2.add(b.vel, Vec2.scale(impulse, b.invMass));
            b.angVel += Vec2.cross(rB, impulse) * b.invInertia;

            // Coulomb friction: oppose post-impulse slip, clamped to μ·j.
            const velA2 = Vec2.add(a.vel, Vec2.crossScalar(a.angVel, rA));
            const velB2 = Vec2.add(b.vel, Vec2.crossScalar(b.angVel, rB));
            const relVel2 = Vec2.sub(velB2, velA2);
            const tangential = Vec2.sub(
                relVel2,
                Vec2.scale(n, Vec2.dot(relVel2, n))
            );
            const slip = Vec2.length(tangential);
            if (Math.sqrt(a.friction * b.friction) > 0) {
                a.touching = true;
                b.touching = true;
            }
            if (slip > 1e-6 && j > 0) {
                const t = Vec2.scale(tangential, 1 / slip);
                const rAxT = Vec2.cross(rA, t);
                const rBxT = Vec2.cross(rB, t);
                const denomT =
                    a.invMass +
                    b.invMass +
                    rAxT * rAxT * a.invInertia +
                    rBxT * rBxT * b.invInertia;
                if (denomT > 0) {
                    const mu = Math.sqrt(a.friction * b.friction);
                    const maxFriction = mu * j;
                    const jt = Math.max(
                        -maxFriction,
                        Math.min(maxFriction, -Vec2.dot(relVel2, t) / denomT)
                    );
                    const frictionImpulse = Vec2.scale(t, jt);
                    a.vel = Vec2.sub(
                        a.vel,
                        Vec2.scale(frictionImpulse, a.invMass)
                    );
                    a.angVel -= Vec2.cross(rA, frictionImpulse) * a.invInertia;
                    b.vel = Vec2.add(
                        b.vel,
                        Vec2.scale(frictionImpulse, b.invMass)
                    );
                    b.angVel += Vec2.cross(rB, frictionImpulse) * b.invInertia;
                }
            }
        }
    }

}

/** Baumgarte positional correction so bodies don't sink; once per substep. */
export function correctPositions(bodies: Body[], contact: Contact): void {
    const a = bodies[contact.a];
    const b = bodies[contact.b];
    const invMassSum = a.invMass + b.invMass;
    if (invMassSum <= 0) return;
    const magnitude =
        (Math.max(contact.depth - PENETRATION_SLOP, 0) / invMassSum) *
        CORRECTION_PERCENT;
    const correction = Vec2.scale(contact.normal, magnitude);
    a.pos = Vec2.sub(a.pos, Vec2.scale(correction, a.invMass));
    b.pos = Vec2.add(b.pos, Vec2.scale(correction, b.invMass));
}
